/**
 * FULL DATABASE BACKUP (Sunday data clear, step 1) — and RESTORE.
 *
 * mongodump is not installed here, so this exports every collection as
 * Extended JSON (types kept: ObjectId, Date, …) to one file per collection in
 * a dated folder OUTSIDE the repo (it holds customer data and must never be
 * committed). Then it re-counts the live collections and refuses to call the
 * backup good unless every count matches.
 *
 *   node backupDb.js                       → backup to %USERPROFILE%/chuvi-backups/<db>-<timestamp>/
 *   node backupDb.js --out <folder>        → backup to that folder
 *   node backupDb.js --restore <folder>    → put every collection back from a backup
 *                                            (each collection is emptied, then refilled).
 *                                            Needs RESTORE_OK="RESTORE CHUVI" for the live database.
 *
 * The database URI is never printed, only its name.
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const os = require('os')
const mongoose = require('mongoose')
const { EJSON } = require('bson')

const arg = (name) => {
    const i = process.argv.indexOf(name)
    return i > -1 ? process.argv[i + 1] : null
}

async function backup(db, dbName) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const out = arg('--out') || path.join(os.homedir(), 'chuvi-backups', `${dbName}-${stamp}`)
    fs.mkdirSync(out, { recursive: true })
    const cols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'))
    const manifest = { db: dbName, at: new Date().toISOString(), collections: {} }
    for (const name of cols.sort()) {
        const docs = await db.collection(name).find({}).toArray()
        fs.writeFileSync(path.join(out, `${name}.json`), EJSON.stringify(docs, { relaxed: false }))
        manifest.collections[name] = docs.length
        console.log(`  ${name.padEnd(28)} ${String(docs.length).padStart(7)}`)
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
    // Verify: read every file back and compare with a fresh live count.
    let bad = 0
    for (const [name, n] of Object.entries(manifest.collections)) {
        const back = EJSON.parse(fs.readFileSync(path.join(out, `${name}.json`), 'utf8')).length
        const live = await db.collection(name).countDocuments()
        if (back !== n || live !== n) {
            bad++
            console.log(`  MISMATCH ${name}: file ${back}, manifest ${n}, live now ${live}`)
        }
    }
    console.log(`\nBackup folder: ${out}`)
    if (bad) {
        console.error(`Backup NOT verified: ${bad} collection(s) differ. Do not clear.`)
        process.exitCode = 1
    } else {
        console.log(`Backup verified: ${cols.length} collections, every count matches.`)
    }
}

async function restore(db, dbName, live) {
    const dir = arg('--restore')
    if (live && process.env.RESTORE_OK !== 'RESTORE CHUVI') {
        console.error('Refusing to restore into the LIVE database without RESTORE_OK="RESTORE CHUVI".')
        process.exit(2)
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    console.log(`Restoring ${Object.keys(manifest.collections).length} collections from a backup of ${manifest.db} taken ${manifest.at}`)
    for (const name of Object.keys(manifest.collections)) {
        const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
        await db.collection(name).deleteMany({})
        if (docs.length) await db.collection(name).insertMany(docs, { ordered: false })
        console.log(`  ${name.padEnd(28)} ${String(docs.length).padStart(7)} restored`)
    }
}

async function main() {
    const url = process.env.MONGODB_URL
    if (!url) throw new Error('MONGODB_URL is not set')
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || 'db'
    const live = /laundrydb/i.test(dbName)
    console.log(`Database: ${dbName}${live ? '  (LIVE)' : ''}`)
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const db = mongoose.connection.db
    if (arg('--restore')) await restore(db, dbName, live)
    else await backup(db, dbName)
    await mongoose.disconnect()
}

main().catch((e) => {
    console.error('backup failed:', e.message)
    process.exit(1)
})

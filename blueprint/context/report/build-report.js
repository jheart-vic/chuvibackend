// Builds the CHUVI V1 System Report: fills Part 2 of v1-report.src.html from the
// step-by-step status in ../TEST-PLAN-STATUS-2026-10-14.md, writes the HTML and
// prints it to PDF with headless Edge (or Chrome).
//
// Run from the repo root: node blueprint/context/report/build-report.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const here = __dirname
const src = fs.readFileSync(path.join(here, 'v1-report.src.html'), 'utf8')
const md = fs.readFileSync(path.join(here, '..', 'TEST-PLAN-STATUS-2026-10-14.md'), 'utf8').replace(/\r\n/g, '\n')

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Plain words for the client: no code names.
const plain = (t) =>
    t
        .replace(/`pricing\.breakdown`/g, 'the bill')
        .replace(/`pushedAt`/g, 'the sent time')
        .replace(/ \(`colorGroup`: white or coloured\)/g, ' (white or coloured)')
        .replace(/its own two-value `colorGroup`, white or coloured/g, 'its own two colours, white or coloured')
        .replace(/`([^`]+)`/g, '"$1"')
        .replace(/₦/g, 'N')
const inline = (t) => esc(plain(t)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/ ?⚠/g, '')

// Parse: scenario headings and their step rows.
const scenarios = []
let cur = null
for (const line of md.split('\n')) {
    const h = line.match(/^## (T\d+ · .+)$/)
    if (h) {
        cur = { title: h[1].replace(' · ', ': '), rows: [] }
        scenarios.push(cur)
        continue
    }
    if (/^## /.test(line)) cur = null
    const r = line.match(/^\| (T\d+\.\d+(?: to T\d+\.\d+)?) \| (.+?) \| (.*) \|$/)
    if (cur && r) {
        const raw = r[2].replace(/\*/g, '').trim()
        const kind = /^Pass/.test(raw)
            ? 'match'
            : /^Not built/.test(raw)
              ? 'new'
              : /^Fail/.test(raw)
                ? 'different'
                : /^Partial/.test(raw)
                  ? 'partly'
                  : 'confirm'
        cur.rows.push({ step: r[1], kind, text: r[3].trim() })
    }
}

const count = (k) => scenarios.reduce((n, s) => n + s.rows.filter((r) => (Array.isArray(k) ? k.includes(r.kind) : r.kind === k)).length, 0)
const total = scenarios.reduce((n, s) => n + s.rows.length, 0)

const LABEL = {
    partly: '<span class="r-partial">Partly</span>',
    different: '<span class="r-fail">Different</span>',
    confirm: '<span class="r-nb">To confirm in the run</span>',
}

function list(kinds, withKind) {
    let out = ''
    for (const s of scenarios) {
        const rows = s.rows.filter((r) => kinds.includes(r.kind))
        if (!rows.length) continue
        out += `<table><tr><th colspan="${withKind ? 3 : 2}">${esc(s.title)}</th></tr>`
        for (const r of rows) {
            const text = r.text ? inline(r.text) : 'As expected.'
            out += withKind
                ? `<tr><td style="width:62px">${r.step}</td><td style="width:92px">${LABEL[r.kind]}</td><td>${text}</td></tr>`
                : `<tr><td style="width:62px">${r.step}</td><td>${text}</td></tr>`
        }
        out += '</table>\n'
    }
    return out
}

const summary = `<table>
<tr><th>Steps checked</th><th>Matches the plan</th><th>New work (not built)</th><th>Built, but different</th></tr>
<tr><td>${total}</td><td class="r-pass">${count('match')}</td><td class="r-nb">${count('new')}</td><td class="r-fail">${count(['partly', 'different', 'confirm'])} <span class="meta">(${count('partly')} partly, ${count('different')} different, ${count('confirm')} to confirm)</span></td></tr>
</table>`

const html = src
    .replace('<!--SUMMARY-->', summary)
    .replace('<!--MATCHES-->', list(['match'], false))
    .replace('<!--NEW-->', list(['new'], false))
    .replace('<!--GAPS-->', list(['partly', 'different', 'confirm'], true))

const outHtml = path.join(here, 'CHUVI-V1-System-Report-2026-10-14.html')
const outPdf = path.join(here, 'CHUVI-V1-System-Report-2026-10-14.pdf')
fs.writeFileSync(outHtml, html)

const browsers = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const browser = browsers.find((b) => fs.existsSync(b))
if (!browser) throw new Error('No Edge or Chrome found to print the PDF')
execFileSync(browser, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outPdf}`,
    'file:///' + outHtml.replace(/\\/g, '/'),
])
console.log(`steps ${total}: match ${count('match')}, new ${count('new')}, different/partly ${count(['partly', 'different', 'confirm'])}`)
console.log('wrote', outHtml)
console.log('wrote', outPdf, fs.statSync(outPdf).size, 'bytes')

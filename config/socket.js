const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { ROLE } = require('../util/constants')

// Real-time transport for the in-app bot + support chat (Phase 6). Authenticated
// customers only — the JWT (same ACCESS_TOKEN_SECRET as the REST API) is verified
// on the socket handshake. Each customer joins a private `user:<id>` room; staff
// (Customer Experience / admin) join `staff:support` to receive handoffs live.
// REST endpoints remain the source of truth; sockets are an additive push layer.
let io = null

const STAFF_ROLES = [ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN]

function initSocket(httpServer, corsOptions) {
    io = new Server(httpServer, {
        cors: corsOptions || { origin: true, credentials: true },
    })

    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.split(' ')[1] ||
                parseCookieToken(socket.handshake.headers?.cookie)
            if (!token) return next(new Error('unauthorized'))
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
            socket.user = { id: decoded.id, userType: decoded.userType }
            next()
        } catch (err) {
            next(new Error('unauthorized'))
        }
    })

    io.on('connection', (socket) => {
        const { id, userType } = socket.user
        socket.join(`user:${id}`)
        if (STAFF_ROLES.includes(userType)) socket.join('staff:support')
    })

    return io
}

function parseCookieToken(cookie) {
    if (!cookie) return null
    const m = cookie.match(/accessToken=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : null
}

function getIO() {
    return io
}

// Push a chat message to the conversation owner and the staff support room.
// No-op (and never throws) when sockets aren't initialised — REST still works.
function emitChatMessage(conversation, message) {
    if (!io || !conversation) return
    try {
        const payload = {
            conversationId: String(conversation._id),
            mode: conversation.mode,
            message,
        }
        io.to(`user:${conversation.userId}`).emit('chat:message', payload)
        io.to('staff:support').emit('chat:message', payload)
    } catch (err) {
        console.warn('Socket emit failed (non-fatal):', err.message)
    }
}

module.exports = { initSocket, getIO, emitChatMessage }

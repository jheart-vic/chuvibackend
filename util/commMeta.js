// Brief 4.2 — what the template editor needs to offer as dropdowns: every
// placeholder key and every target page, each with one line on what it does.
//
// EVERYTHING HERE IS DERIVED FROM WHAT THE CODE ACTUALLY SENDS, not from a wish
// list. `{{name}}` and `{{firstName}}` are filled from the user document by
// CommunicationService.render(); every other key comes from the `data` object the
// calling system passes with that specific template key, so a key is only
// available in the template it belongs to. An unknown {{key}} is left on the page
// verbatim — it does not throw, it prints "{{whatever}}" to the customer.

// Deep-link targets: which app page the message opens. `page` is a free string on
// the model, so this list is the set the app actually handles today.
const TARGET_PAGES = [
    {
        page: 'offers',
        description: 'The customer\'s rewards/offers page — use for anything they must claim or redeem.',
    },
    {
        page: 'wallet',
        description: 'The wallet page, showing balance and credits — use when money or credit has moved.',
    },
    {
        page: 'referral',
        description: 'The referral page, showing their level and invite link.',
    },
    {
        page: 'complaint',
        description: 'The complaint/conversation thread — use for anything about a reported problem.',
    },
    {
        page: 'order',
        description: 'The order detail page. Send recordId with the order id so it opens the right one.',
    },
]

// Filled for EVERY template, from the user document.
const UNIVERSAL_PLACEHOLDERS = [
    {
        key: 'name',
        description: "The customer's full name, or \"there\" when it is unknown.",
        example: 'Ada Obi',
    },
    {
        key: 'firstName',
        description: 'First word of the customer\'s name — the usual greeting.',
        example: 'Ada',
    },
]

// The template keys other systems render by, and the placeholders each one's
// caller supplies. Editing a template's TEXT is free; its KEY is immutable,
// because this is what the sending code looks it up by.
const TEMPLATE_KEYS = [
    {
        key: 'offer-available',
        description: 'Sent when a customer is given an offer they can use.',
        sentBy: 'Offer system (offer.service.js)',
        placeholders: [
            { key: 'offerName', description: 'Name of the offer they were given.', example: 'First Experience' },
        ],
    },
    {
        key: 'referral-reward',
        description: "Sent when someone they referred completes a first order and credit is paid.",
        sentBy: 'Referral system (referral.service.js)',
        placeholders: [
            { key: 'amount', description: 'Referral credit added, in naira, already formatted.', example: '1,500' },
            { key: 'referredName', description: 'Who they referred (currently always "your friend").', example: 'your friend' },
        ],
    },
    {
        key: 'referral-level-up',
        description: 'Sent when a customer reaches a new referral level.',
        sentBy: 'Referral system (referral.service.js)',
        placeholders: [
            { key: 'levelName', description: 'The level just reached.', example: 'Gold' },
            { key: 'rewardPercent', description: 'Referral reward percentage at that level.', example: '10' },
            { key: 'benefitsLine', description: 'Sentence listing the extra perks at that level.', example: ', plus free pickup on every order' },
        ],
    },
    {
        key: 'referral-monthly-benefit',
        description: "Sent when a customer hits that month's referral target and the perk is credited.",
        sentBy: 'Referral system (referral.service.js)',
        placeholders: [
            { key: 'levelName', description: 'Their referral level.', example: 'Gold' },
            { key: 'amount', description: 'Free-laundry credit added, in naira, already formatted.', example: '5,000' },
        ],
    },
    {
        key: 'complaint-update',
        description: 'Sent on every change to a complaint: resolved, recovery delivered, credit or cash approved, and the confirm reminder.',
        sentBy: 'Recovery system (recovery.service.js)',
        placeholders: [
            {
                key: 'update',
                description: 'The sentence describing what changed — written by the recovery system, not by the template.',
                example: 'your issue has been resolved — please confirm',
            },
        ],
    },
    {
        key: 'generic-announcement',
        description: 'Free-form announcement. Both the title and the body come from whoever sends it.',
        sentBy: 'Any system / admin broadcast',
        placeholders: [
            { key: 'title', description: 'Headline supplied by the sender.', example: 'Holiday opening hours' },
            { key: 'message', description: 'Body text supplied by the sender.', example: 'We are closed on Monday.' },
        ],
    },
]

module.exports = { TARGET_PAGES, UNIVERSAL_PLACEHOLDERS, TEMPLATE_KEYS }

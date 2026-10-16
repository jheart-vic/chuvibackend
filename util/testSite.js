// TEST SITE (client 16 Oct): a copy of the system on test data only, set with
// TEST_SITE=1 on the TEST server and never on live. When set:
//   * staff log in as normal; CUSTOMER accounts only if their email is a test
//     address (@chuvitest.com, the dummy customers) — "staff login only";
//   * no SMS, email or WhatsApp-bot message ever leaves the server, even if a key
//     was added by mistake ("no SMS to real customers");
//   * every response says noindex and /robots.txt disallows all ("hidden from Google").
const TEST_CUSTOMER_DOMAIN = '@chuvitest.com'

const isTestSite = () => process.env.TEST_SITE === '1' || process.env.TEST_SITE === 'true'

/** Refusal for a customer account that is not a test account, or null. */
function testSiteRefusal({ email, userType }) {
    if (!isTestSite()) return null
    if (userType && userType !== 'user') return null // staff: allowed
    if (String(email || '').toLowerCase().endsWith(TEST_CUSTOMER_DOMAIN)) return null
    return {
        error: 'This is the CHUVI test site: staff and test accounts only.',
        testSite: true,
    }
}

/** Express middleware: tell search engines to stay away. */
function noIndex(req, res, next) {
    if (!isTestSite()) return next()
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n')
    return next()
}

module.exports = { isTestSite, testSiteRefusal, noIndex, TEST_CUSTOMER_DOMAIN }

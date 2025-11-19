
const os = require('os');

function getDeviceInfo(){
    const deviceName = os.hostname();
    
    // Get the operating system platform
    const platform = os.platform();
    
    // Get the architecture of the system
    const arch = os.arch();
    return {
        arch,
        deviceName,
        platform
    }
}

module.exports = {
    getDeviceInfo
}
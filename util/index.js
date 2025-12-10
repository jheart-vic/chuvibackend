const { default: mongoose } = require("mongoose");
const { deleteImage } = require("./imageUpload");


exports.isEmpty = (data = null) => {
    let rtn = false;
    if (this.isString(data) && (data === "" || data.trim() === "")) rtn = true;
    else if (this.isNumber(data) && data === 0) rtn = true;
    else if (this.isBoolean(data) && data === false) rtn = true;
    else if (this.isObject(data) && Object.values(data).length === 0) rtn = true;
    else if (this.isArray(data) && data.length === 0) rtn = true;
    else if (this.isUndefined(data)) rtn = true;
    else if (this.isNull(data)) rtn = true;

    return rtn;
}

exports.isObject = (data = null) => {
    return (typeof data === "object" && Object.prototype.toString.call(data) === "[object Object]") ? true : false;
}

exports.isArray = (data = null) => {
    return (typeof data === "object" && Object.prototype.toString.call(data) === "[object Array]") || Array.isArray(data) ? true : false;
}

exports.isString = (data = null) => {
    return typeof data === "string";
}

exports.isNumber = (value = null) => {
    try {
        return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity
    } catch (err) {
        return false;
    }
}

exports.isBoolean = (data = null) => {
    return (typeof data === "boolean" || data === true || data === false);
}

exports.isUndefined = (data = null) => {
    return (typeof data === "undefined" || data === undefined);
}

exports.isNull = (data = null) => {
    return (data === null ? true : false);
}

exports.empty = (data = null) => {
    return this.isEmpty(data);
}

exports.randomNumberWithInterval = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);


exports.generateRandomCodes = (amount, min_length = 10, max_length = 16, characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") => {
    const string = [];
    for (let j = 0; j < amount; j++) {
        let first_string = '';
        const random_string_length = this.randomNumberWithInterval(min_length, max_length);
        for (let i = 0; i < random_string_length; i++) {
            first_string += characters[this.randomNumberWithInterval(0, characters.length - 1)];
        }
        string.push(first_string);
    }
    return string[0];
}


exports.imageCleanUp = async function(images){
    for(let i = 0; i < images.length; i++){
        await deleteImage(images[i].publicId)
      }   
}

exports.isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
  };
  

  exports.reindex = (key, arr)=> {
    if(arr.length < 1) return
    const obj = {}
    for(let i = 0; i < arr.length; i++){
      obj[arr[i][key]] = arr[i]
    }
    return obj
  }
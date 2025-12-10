const Validator = require('validatorjs')
const mongoose = require('mongoose')

Validator.register(
    'object',
    function(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    },
    'The :attribute must be an object.'
  );

  Validator.register(
    'objectId',
    function (value) {
      return mongoose.Types.ObjectId.isValid(value);
    },
    'The :attribute must be a valid MongoDB ObjectId.'
  );
  

function validateData(body, rules, messages){
    const result = new Validator(body, rules, messages)
    if(result.fails()){
        const error_object = result.errors.all()
        const first_key = Object.keys(result.errors.all())[0]

        const error_message = error_object[first_key][0]
        return {success: false, data:  error_message}
    }
    return {success: true, data: null}
}


module.exports = validateData
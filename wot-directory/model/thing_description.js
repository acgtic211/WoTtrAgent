var mongoose = require('mongoose');

var thing_descriptionSchema = mongoose.Schema({ 
    _id: {
        type: mongoose.Types.ObjectId, 
        select: false
    },
    id: {
        type: String,
        required: true
    },
    base: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now(),
        select: false
    },
    updatedAt: {
        type: Date,
        default: Date.now(),
        select: false
    },
}, {strict: false, retainKeyOrder: true, versionKey: false, minimize: false});

mongoose.model('thing_description', thing_descriptionSchema); 
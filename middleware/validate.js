const { blogSchemas } = require('../validation/schemas');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({ 
        error: 'Validation error', 
        details: errorMessages 
      });
    }

    next();
  };
};

// Blog-specific validation middleware
const validateBlog = validate(blogSchemas.create);

module.exports = {
  validate,
  validateBlog
};

// swagger.js or part of app.js
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
// const { SavingSchema } = require("./models/saving.model");

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Chuvi laundry API",
      version: "1.0.0",
      description: "API documentation for your Chuvi laundry App",
    },
    servers: [
      {
        url: "https://chuvibackend.onrender.com/api",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./routes/**/*.js", "./swagger/**/*.js"]
};


const swaggerSpec = swaggerJsDoc(swaggerOptions);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

module.exports = setupSwagger;

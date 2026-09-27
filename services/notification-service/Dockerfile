FROM node:20-alpine
WORKDIR /app
COPY services/notification-service/package*.json ./
RUN npm install
COPY services/notification-service/. .
EXPOSE 3006
CMD ["node", "src/index.js"]

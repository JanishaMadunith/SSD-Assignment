FROM node:20-alpine
WORKDIR /app
COPY services/telemedicine-service/package*.json ./
RUN npm install
COPY services/telemedicine-service/. .
COPY shared /shared
RUN cd /shared && npm install --omit=dev
EXPOSE 3004
CMD ["node", "src/index.js"]

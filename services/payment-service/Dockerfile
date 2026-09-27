FROM node:20-alpine
WORKDIR /app
COPY services/payment-service/package*.json ./
RUN npm install
COPY services/payment-service/. .
COPY shared /shared
RUN cd /shared && npm install --omit=dev
EXPOSE 3005
CMD ["node", "src/index.js"]

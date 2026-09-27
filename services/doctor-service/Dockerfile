FROM node:20-alpine
WORKDIR /app
COPY services/doctor-service/package*.json ./
RUN npm install
COPY services/doctor-service/. .
COPY shared /shared
RUN cd /shared && npm install --omit=dev
EXPOSE 3002
CMD ["node", "src/index.js"]

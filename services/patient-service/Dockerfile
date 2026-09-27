FROM node:20-alpine
WORKDIR /app
COPY services/patient-service/package*.json ./
RUN npm install
COPY services/patient-service/. .
COPY shared /shared
RUN cd /shared && npm install --omit=dev
EXPOSE 3001
CMD ["node", "src/index.js"]

FROM node:20-alpine
WORKDIR /app
COPY services/auth-service/package*.json ./
RUN npm install
COPY services/auth-service/. .
COPY shared /shared
RUN cd /shared && npm install --omit=dev
EXPOSE 3000
CMD ["node", "src/index.js"]

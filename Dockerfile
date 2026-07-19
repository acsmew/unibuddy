FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

ENV PORT=7860

CMD ["node", "server.js"]

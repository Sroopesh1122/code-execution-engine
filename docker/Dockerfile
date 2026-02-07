FROM python:3.11-alpine

WORKDIR /app

RUN apk add --no-cache bash nodejs npm openjdk17 gcc g++ make

COPY . .

RUN npm install

EXPOSE 3000

CMD ["node", "server.js"]

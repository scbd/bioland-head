FROM node:18-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache curl

WORKDIR /usr/src/app

COPY package.json ./

RUN npm run clean-reinstall

COPY . ./

RUN npm run build

ENV PORT 8000

EXPOSE 8000

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=8000

CMD ["node", ".output/server/index.mjs"]
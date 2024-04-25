FROM node:20

RUN apt update && \
    apt install yarn curl -y

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn clean-reinstall

COPY . ./

RUN yarn build

ENV PORT 8000

EXPOSE 8000

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=8000



CMD ["node", "--max-http-header-size=32768",".output/server/index.mjs"]
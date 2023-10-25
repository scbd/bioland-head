FROM node:18

RUN apt update && \
    apt install yarn curl -y

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn clean-reinstall
RUN npm install --platform=linux --arch=64x --arm-version=7 --libc=glibc sharp

COPY . ./

RUN yarn build

ENV PORT 8000

EXPOSE 8000

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=8000

CMD ["node", ".output/server/index.mjs"]
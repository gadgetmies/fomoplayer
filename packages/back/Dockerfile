FROM node:16
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/packages/back
RUN yarn

EXPOSE 3000
CMD ["yarn", "start:prod"]

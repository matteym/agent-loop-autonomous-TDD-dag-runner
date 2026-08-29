FROM node:22-alpine
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install
COPY . .
CMD ["yarn", "dev"]

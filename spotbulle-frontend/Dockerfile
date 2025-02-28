# Étape de construction
FROM node:16 as build

WORKDIR /app
COPY . /app

RUN npm install
RUN npm run build

# Étape de production
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]

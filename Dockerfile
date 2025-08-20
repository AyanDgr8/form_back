# /var/www/html/form_back/Dockerfile
FROM node:18-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Copy only package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy remaining app source code
COPY . .

# App listens on port 8990
EXPOSE 8990

# Start the app
CMD ["npm", "start"]

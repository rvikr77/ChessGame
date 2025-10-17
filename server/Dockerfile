# Use Node.js LTS image
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy rest of server files
COPY . .

# Expose Cloud Run port
EXPOSE 8080

# Start the server
CMD ["node", "index.js"]

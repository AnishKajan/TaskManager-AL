FROM --platform=linux/arm64 node:18-alpine

# Install necessary build tools for native modules like bcrypt
RUN apk add --no-cache make gcc g++ python3

# Set working directory
WORKDIR /app

# Copy only dependency declarations to leverage caching
COPY package*.json ./

# Install dependencies with legacy peer deps to resolve OpenAI conflicts
RUN npm install --omit=dev --legacy-peer-deps

# Copy the full app source into the container
COPY . .

# Expose backend port
EXPOSE 5050

# Run the backend server using node
CMD ["node", "server.js"]
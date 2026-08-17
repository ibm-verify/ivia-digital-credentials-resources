# Build stage - includes npm for building
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest AS build

WORKDIR /opt/app

RUN microdnf module enable -y nodejs:22 && \
    microdnf install -y nodejs npm && \
    microdnf update -y && \
    microdnf remove -y findutils && \
    microdnf clean all

RUN npm install npm@latest -g

# Copy package files first for better caching
COPY ./dmv-app/package*.json /opt/app/
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy the rest of the application
COPY ./dmv-app /opt/app/

# Build the application
RUN npm run build

# Remove devDependencies - only production deps needed at runtime
RUN npm ci --omit=dev

# Runtime stage - only Node.js, no npm
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest

WORKDIR /opt/app

# Install only nodejs (not npm) for runtime
RUN microdnf module enable -y nodejs:22 && \
    microdnf install -y nodejs && \
    microdnf update -y && \
    microdnf remove -y findutils && \
    microdnf clean all

# Remove npm and corepack bundled by the nodejs RPM into /usr/lib/node_modules
RUN rm -rf /usr/lib/node_modules

# Copy built application and production dependencies from build stage
COPY --from=build /opt/app/ /opt/app/

# Create cache directory and set permissions
RUN mkdir -p /opt/app/node_modules/.cache && \
    chmod -R 777 /opt/app/node_modules/.cache

# Ensure build directory has proper permissions
RUN chmod -R 777 /opt/app/build

# Use node to run the server.mjs file
CMD ["node", "/opt/app/server.mjs"]

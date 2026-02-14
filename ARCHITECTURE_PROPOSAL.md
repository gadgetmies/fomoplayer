# Architecture Proposal: Transitioning to Micro-frontends and Microservices

## 1. Introduction
The current Fomo Player architecture is a Monorepo containing a monolithic backend (Node.js/Express) and a monolithic frontend (React). While this served well during initial development, scaling the application, improving testability, and enabling independent deployments requires a more decoupled architecture.

This proposal outlines a plan to split the application into domain-driven microservices and micro-frontends, following industry best practices while keeping operational costs low.

## 2. Goals
- **Individual Deployability**: Each service/MFE can be deployed without affecting others.
- **Improved Testability**: Smaller units of code are easier to test and mock.
- **Reduced Coupling**: Clear boundaries and APIs between domains.
- **Scalability**: Independently scale resource-intensive parts (e.g., track ingestion).
- **Cost Efficiency**: Use shared infrastructure and serverless technologies where appropriate.

## 3. Proposed Backend Architecture (Microservices)

The backend will be split into several services based on functional domains:

### 3.1. Identity & Access Service (Auth)
- **Responsibility**: User authentication (Google, Session-based), registration, and JWT issuance.
- **Benefit**: Centralizes security and allows other services to be agnostic of the auth implementation.

### 3.2. Discovery Service (Tracks & Search)
- **Responsibility**: Searching for tracks, artists, and labels. Managing store-specific metadata (Beatport, Spotify, Bandcamp).
- **Benefit**: Handles the most frequent read operations. Can be scaled independently to handle search traffic.

### 3.3. User Data Service
- **Responsibility**: Managing user profiles, settings, follows (artists/labels), and ignores.
- **Benefit**: Decouples user-specific preferences from the core track discovery.

### 3.4. Collection Service (Carts & Library)
- **Responsibility**: Managing user carts, heard tracks, and public cart sharing.
- **Benefit**: Focuses on the "personal library" aspect of the app.

### 3.5. Ingestion Service (The "Worker")
- **Responsibility**: Background jobs for fetching new tracks from stores, updating scores, and processing notifications.
- **Benefit**: This is the most resource-intensive part. Moving it to a separate service prevents background jobs from impacting API responsiveness.

### 3.6. Notification Service
- **Responsibility**: Sending emails and managing in-app notifications.
- **Benefit**: Can be treated as an asynchronous task triggered by events from other services.

### 3.7. Analyser Service (Existing)
- **Responsibility**: Audio analysis and waveform generation.
- **Benefit**: Already semi-decoupled; should be fully integrated as a standalone service.

---

## 4. Proposed Frontend Architecture (Micro-frontends)

Using a "Shell" or "Container" approach to host multiple MFEs:

### 4.1. Shell Application
- Handles global routing, authentication, layout (TopBar), and shared state.
- Orchestrates the loading of other MFEs.

### 4.2. Player MFE
- The core music discovery interface (Track lists, Player controls, Search results).

### 4.3. Settings & Profile MFE
- User-specific configurations, follow management, and notification settings.

### 4.4. Admin MFE
- Dashboard for administrative tasks.

**Integration Strategy**: Use **Webpack Module Federation** or **Vite Module Federation** for runtime integration, allowing each MFE to be built and deployed independently.

---

## 5. Communication & Integration

### 5.1. API Gateway
A single entry point (e.g., NGINX, Kong, or a simple Node.js gateway) that routes requests to the appropriate microservice based on the URL path (`/api/auth`, `/api/tracks`, etc.).

### 5.2. Inter-service Communication
- **Synchronous**: REST or gRPC for immediate data needs.
- **Asynchronous**: An Event Bus (e.g., Redis Pub/Sub, RabbitMQ, or AWS SNS/SQS) for decoupled workflows.
    - *Example*: Ingestion Service finds a new track -> Publishes `TRACK_ADDED` event -> Notification Service sends an email.

---

## 6. Data Management
To maintain low costs while ensuring decoupling:
- **Logical Separation**: Initially, all services can share a single PostgreSQL instance but use different **Schemas** or **Users** to enforce data boundaries.
- **Evolution**: As the app scales, schemas can be moved to dedicated database instances if performance becomes a bottleneck.

---

## 7. Cost-Efficiency Strategy
- **Containerization**: Use Docker for all services.
- **Shared Infrastructure**: Use a single cluster (e.g., AWS ECS, K8s, or even a single VM with PM2/Docker Compose) for multiple services.
- **Scale-to-Zero**: For low-traffic services (like Admin), consider Serverless Functions (AWS Lambda / Google Cloud Functions) to eliminate idle costs.
- **Monorepo Management**: Continue using the Monorepo (Yarn Workspaces) to share code (`packages/shared`) and simplify dependency management.

---

## 8. Implementation Roadmap (Phased Approach)

### Phase 1: Modular Monolith
Refactor the existing `packages/back` and `packages/front` to have strict internal boundaries between domains. Enforce these boundaries with ESLint or similar tools.

### Phase 2: Extract the Ingestion Service
Extract the background jobs (`job-scheduling.js` and `jobs/`) into a separate service. This provides immediate performance benefits to the API.

### Phase 3: Extract Auth & Identity
Move authentication logic to a dedicated service. This enables other services to be developed and tested independently.

### Phase 4: Full Micro-frontend Migration
Split the React app into MFEs, starting with the Admin dashboard, then Settings, and finally the Player.

---

## 9. Conclusion
This transition will transform Fomo Player into a modern, scalable, and highly maintainable application. By adopting a phased approach and leveraging shared infrastructure, we can achieve the benefits of microservices without a significant increase in running costs.

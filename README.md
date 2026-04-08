# Gitanic

A distributed cloud-native Git hosting platform and static website deployment system. This project was developed as a part of our coursework for 23XT66 - Cloud Computing Lab at PSG College of Technology.

Gitanic allows developers to create Git repositories, push source code, and automatically deploy static websites from a single interface. It also includes a JavaFX desktop client that operates similarly to a lightweight version of GitHub Desktop. The desktop application of the project is packaged as a single portable executable file (`gitanic.exe`).

---

## Architecture of the System

Gitanic is a three-service distributed system. Each free-tier cloud provider handles strictly separated responsibilities:

| Service            | Responsibility                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**   | Hosts the frontend built with Next.js 16. It handles wildcard `*.gitanic.com` subdomain routing via Edge Middleware and caches deployment details using Edge Config. |
| **Railway**  | Runs the Express API and the Git Smart-HTTP server. It executes the deployment build pipeline and stores bare repositories on a persistent disk volume (`/repos`).   |
| **Supabase** | Hosts the PostgreSQL database. It stores the static build files in a Storage bucket and provides Realtime log streaming.                                               |

The backend of the platform is designed as a Modular Monolith. It runs as a single Node.js process using Express.js but maintains cleanly separated internal modules.

```text
Browser ──→ Vercel (Next.js) ──→ Railway API (Express)
                ↑                        ↓
         *.gitanic.com           Supabase Storage
         subdomain proxy              (files)
                                 Supabase DB + Realtime
                                      (state + logs)
```

---

## Design Patterns

We effectively structure code using widely recognized design patterns.

| Pattern              | Application Level      | Purpose                                                                                                             |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **MVC**        | Entire web layer       | Next.js pages act as the View. Express controllers act as the Controller. Services act as the Model layer.          |
| **Repository** | `*.repository.ts`    | All SQL queries are isolated here. The services of the application never write raw queries.                         |
| **Strategy**   | `deploy/strategies/` | Allows switching the build algorithm at runtime using a simple `detect()` and `build()` interface.              |
| **Observer**   | `deploy.service.ts`  | Dispatches internal events when a build starts or fails. The log service streams these events to Supabase Realtime. |
| **Singleton**  | `lib/db.ts`          | Ensures exactly one connection pool per process to prevent memory leaks.                                            |

---

## Deployment Pipeline

Every deployment process follows a strict execution pipeline. This pipeline runs when a developer pushes code to the repository or clicks the manual deploy button.

1. **Enqueue** - The system creates a database record and pushes the job to a FIFO queue to ensure only one build processes at a time.
2. **Checkout** - It safely extracts the code elements of the selected branch into an isolated temporary folder.
3. **Detect** - It determines the build strategy representing the framework (Vite, Create React App, or Static HTML).
4. **Build** - The system runs an isolated `execFileSync` command with a restricted system path and an empty environment to maintain strict security boundaries.
5. **Upload** - It batches the generated files and uploads them in parallel to Supabase Storage.
6. **Atomic Update** - The database updates the pointer of the active live site only if the build finishes without errors.
7. **Clean Up** - The system deletes older deployments from the storage and clears out the temporary build directory.

If any failure occurs, the pipeline instantly aborts the process. It deletes partial uploads and leaves the previous live site untouched.

---

## Supported Frameworks

- **Vite** (React, Vue, Svelte, Vanilla JavaScript)
- **Create React App**
- **Static HTML/CSS/JS**

Frameworks requiring Server-Side Rendering (SSR) such as Next.js or Remix are strictly rejected by the pipeline.

---

## Security Model

The security implementations of the platform handle isolation and authentication rigorously:

- **Web API**: Authentication relies on JWT Bearer tokens utilizing the secure HS256 algorithm.
- **Git HTTP**: Terminal interactions decode HTTP Basic Authentication and verify them against bcrypt hashes in the database. Constant-time comparisons run natively to prevent timing attacks.
- **Internal Routes**: Background automations are protected by a shared secret header validated using the timing-safe equalization tools of the backend framework.
- **OTP Verification**: Randomly generated verification pins are completely hashed with SHA-256 before insertion into the database. Plaintext tokens of the verification are never stored.

---

## Subdomain Routing

Vercel intercepts all traffic hitting wildcard subdomains (`*.gitanic.com`) through Edge Middleware. The middleware code extracts the username of the request parameter, retrieves the current deployment ID from the Vercel Edge Config cache, and internally rewrites the user to proxy Supabase Storage.

This ensures live rendering of the static files. The cache clears itself fully through an API function triggered after every successful build.

---

## Desktop Client (JavaFX)

The desktop application of the platform provides a graphical user interface wrapping the native `git` commands of the operating system.

**Key Controllers:**

- `AppState` - A singleton tracking the user state, the API connection url, and the current repository directory of the machine.
- `EventBus` - A publish and subscribe manager resolving user interface signals like logins or directory changes.
- `GitCommandService` - A secure process builder layer to safely execute CLI commands without shell injection vulnerabilities.

---

## Getting Started

### Prerequisites

- Node.js (Version 20 or higher)
- Java 21 and Apache Maven
- A free-tier Supabase project
- A Railway cloud account
- A Vercel deployment account

### Backend Setup

```bash
cd backend
npm install
npm run dev        # Run the API with hot-reloading
npm run build      # Compile the TypeScript files
npm start          # Run the main distribution file
```

You must inject environment variables defining the URL strings of the database and secure configuration tokens.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev        # Run the frontend server on port 3001
npm run build      # Process the production Next.js build
```

### Database Migration

Apply the SQL migration files sequentially through the Supabase SQL editor located inside the `database/migrations` directory. Proper execution of the migration scripts guarantees the stability of the schema relations.

### Building the Desktop Application

```bash
cd javafx
mvn clean install    # Build the fat JAR and package gitanic.exe
mvn javafx:run       # Directly run the JavaFX graphical client
```

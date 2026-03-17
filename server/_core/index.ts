
import "dotenv/config";
import net from "net";
import { createApp } from "./app";
import { scheduleCronJobs } from "../cronJobs";
import { seedDefaultAdmin } from "../seedAdmin";
import { seedMigration } from "../seedMigration";
import { runAutoMigrations } from "../autoMigrate";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const { server } = await createApp();

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Auto-migrate: add any missing columns to the database
    await runAutoMigrations();
    // Seed default admin user
    await seedDefaultAdmin();
    // Seed migration data
    await seedMigration();
    // Initialize scheduled cron jobs (reads config from DB, so must be awaited)
    await scheduleCronJobs();
  });
}

startServer().catch(console.error);

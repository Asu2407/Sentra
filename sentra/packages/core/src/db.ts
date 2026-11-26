import "dotenv/config";
import mongoose, { type Connection } from "mongoose";
import { ENV_MONGODB_URI } from "./constants.js";
import { getAuditEntryModel } from "./models/AuditEntry.js";
import { getConsumedKeyModel } from "./models/ConsumedKey.js";
import { getExecutionRecordModel } from "./models/ExecutionRecord.js";
import { getOAuthTokenModel } from "./models/OAuthToken.js";
import { getProposalModel } from "./models/Proposal.js";
import { getQuarantineItemModel } from "./models/QuarantineItem.js";
import { getSourceModel } from "./models/Source.js";

const globalForMongo = globalThis as unknown as {
  __sentraMongoPromise?: Promise<Connection>;
};

export async function syncAllIndexes(conn: Connection = mongoose.connection): Promise<void> {
  try {
    await Promise.all([
      getSourceModel(conn).init(),
      getProposalModel(conn).init(),
      getConsumedKeyModel(conn).init(),
      getAuditEntryModel(conn).init(),
      getExecutionRecordModel(conn).init(),
      getOAuthTokenModel(conn).init(),
      getQuarantineItemModel(conn).init(),
    ]);
  } catch (err) {
    console.error("[Sentra-Core] Failed to create/sync MongoDB unique indexes:", err);
    throw err;
  }
}

export async function connect(explicitUri?: string): Promise<Connection> {
  const uri = explicitUri ?? process.env[ENV_MONGODB_URI]?.trim();
  if (!uri) {
    throw new Error(
      `Missing required ${ENV_MONGODB_URI} environment variable. Set it in .env or pass a URI to connect().`
    );
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!globalForMongo.__sentraMongoPromise) {
    globalForMongo.__sentraMongoPromise = mongoose
      .connect(uri)
      .then(async (m) => {
        await syncAllIndexes(m.connection);
        return m.connection;
      })
      .catch((err) => {
        globalForMongo.__sentraMongoPromise = undefined;
        throw err;
      });
  }

  return globalForMongo.__sentraMongoPromise;
}

export async function disconnect(): Promise<void> {
  globalForMongo.__sentraMongoPromise = undefined;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

import pool from './connection';

const createTables = async () => {
  const client = await pool.connect();

  try {
    console.log('🔄 Creating tables...');

    // Drop existing tables if they exist (for clean setup)
    await client.query('DROP TABLE IF EXISTS users CASCADE;');

    // Create users table matching Prisma schema
    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(255) UNIQUE NOT NULL,

        -- Profile fields (nullable)
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE, 
        phone VARCHAR(50),

        -- Email verification
        email_verified BOOLEAN DEFAULT FALSE,
        email_verify_token VARCHAR(255),
        email_verify_expiry TIMESTAMP,

        -- Referral program
        referral_code VARCHAR(20) UNIQUE NOT NULL,
        referred_by UUID REFERENCES users(id),
        terms_accepted_at TIMESTAMP,

        -- Points tracking
        earned_points INTEGER DEFAULT 0,
        pending_points INTEGER DEFAULT 0,

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX idx_users_wallet_address ON users(wallet_address);
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_referral_code ON users(referral_code);
      CREATE INDEX idx_users_referred_by ON users(referred_by);
    `);

    // Create trigger to auto-update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ Tables created successfully');
    console.log('✅ Indexes created successfully');
    console.log('✅ Triggers created successfully');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

createTables()
  .then(() => {
    console.log('\n✅ Database setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Database setup failed:', error);
    process.exit(1);
  });

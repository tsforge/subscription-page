import { config } from 'dotenv';

process.env.NODE_ENV = 'development';
config({ path: '.env.test.sample' });
config({ path: '.env.test' });

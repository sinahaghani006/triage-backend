process.env.NODE_ENV = 'test';

const request = require('supertest');
const bcrypt = require('bcrypt');

// Mock the Prisma client so tests don't require a real PostgreSQL instance.
jest.mock('../src/config/prismaClient', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  errorLog: { create: jest.fn().mockResolvedValue({}) },
}));

const prisma = require('../src/config/prismaClient');
const createApp = require('../src/app');

const app = createApp();

describe('POST /auth/register', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a new user and returns a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      name: 'Sara',
      email: 'sara@example.com',
      passwordHash: 'hashed',
      createdAt: new Date(),
      patientDetails: { birthDate: new Date('1995-06-01') },
    });

    const res = await request(app).post('/auth/register').send({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'strongPassword123',
      birthDate: '1995-06-01',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('sara@example.com');
    expect(res.body.token).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();

    const setCookieHeader = res.headers['set-cookie'] || [];
    const authCookie = setCookieHeader.find((c) => c.startsWith('token='));
    expect(authCookie).toBeDefined();
    expect(authCookie.toLowerCase()).toContain('httponly');
  });

  it('rejects registration with an already-used email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'sara@example.com' });

    const res = await request(app).post('/auth/register').send({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'strongPassword123',
      birthDate: '1995-06-01',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects registration with invalid input (validation)', async () => {
    const res = await request(app).post('/auth/register').send({
      name: '',
      email: 'not-an-email',
      password: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration missing birthDate', async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'strongPassword123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d) => d.field === 'birthDate')).toBe(true);
  });
});

describe('POST /auth/login', () => {
  afterEach(() => jest.clearAllMocks());

  it('logs in with correct credentials and returns a token', async () => {
    const passwordHash = await bcrypt.hash('correctPassword1', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Sara',
      email: 'sara@example.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await request(app).post('/auth/login').send({
      email: 'sara@example.com',
      password: 'correctPassword1',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    const setCookieHeader = res.headers['set-cookie'] || [];
    const authCookie = setCookieHeader.find((c) => c.startsWith('token='));
    expect(authCookie).toBeDefined();
    expect(authCookie.toLowerCase()).toContain('httponly');
  });

  it('rejects login with wrong password', async () => {
    const passwordHash = await bcrypt.hash('correctPassword1', 12);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'sara@example.com',
      passwordHash,
    });

    const res = await request(app).post('/auth/login').send({
      email: 'sara@example.com',
      password: 'wrongPassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/auth/login').send({
      email: 'nobody@example.com',
      password: 'whatever123',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

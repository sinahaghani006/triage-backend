process.env.NODE_ENV = 'test';

const request = require('supertest');

jest.mock('../src/config/prismaClient', () => ({
  errorLog: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../src/services/aiTriageGateway', () => ({
  getPresentingProblems: jest.fn(),
}));

const { getPresentingProblems } = require('../src/services/aiTriageGateway');
const createApp = require('../src/app');

const app = createApp();

describe('GET /presenting-problems', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the list without requiring auth', async () => {
    getPresentingProblems.mockReturnValue([
      { id: 'fever', label: 'تب' },
      { id: 'chest_pain', label: 'درد قفسه سینه' },
    ]);

    const res = await request(app).get('/presenting-problems');

    expect(res.status).toBe(200);
    expect(res.body.presentingProblems).toEqual([
      { id: 'fever', label: 'تب' },
      { id: 'chest_pain', label: 'درد قفسه سینه' },
    ]);
  });

  it('propagates a 503 if the AI module is unavailable', async () => {
    const AppError = require('../src/utils/AppError');
    getPresentingProblems.mockImplementation(() => {
      throw new AppError('AI module not available', 503, 'AI_SERVICE_UNAVAILABLE');
    });

    const res = await request(app).get('/presenting-problems');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
  });
});

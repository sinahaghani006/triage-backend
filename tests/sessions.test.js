process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/prismaClient', () => ({
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  triageResult: { create: jest.fn() },
  patientDetails: { findUnique: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  errorLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn(),
}));

jest.mock('../src/services/aiTriageGateway', () => ({
  runAiTriageAnalysis: jest.fn(),
}));

const prisma = require('../src/config/prismaClient');
const { runAiTriageAnalysis } = require('../src/services/aiTriageGateway');
const createApp = require('../src/app');

const app = createApp();
const USER_ID = 'user-1';
const SESSION_ID = 'a1b2c3d4-e5f6-4789-a123-0123456789ab';

function authHeaderFor(userId, role = 'patient') {
  const token = jwt.sign({ sub: userId, email: 'sara@example.com', role }, 'test-secret', {
    expiresIn: '1h',
  });
  return { Authorization: `Bearer ${token}` };
}

function baseSession(overrides = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    currentState: 'S2_collecting_information',
    presentingProblemId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
    cancelledAt: null,
    triageResult: null,
    ...overrides,
  };
}

describe('Sessions API', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects requests without a valid token', async () => {
    const res = await request(app).post('/sessions');
    expect(res.status).toBe(401);
  });

  it('creates a session directly in S2_collecting_information', async () => {
    prisma.session.create.mockResolvedValue(baseSession());

    const res = await request(app).post('/sessions').set(authHeaderFor(USER_ID));

    expect(res.status).toBe(201);
    expect(res.body.session.currentState).toBe('S2_collecting_information');
  });

  it('gets a session owned by the caller', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession());

    const res = await request(app).get(`/sessions/${SESSION_ID}`).set(authHeaderFor(USER_ID));

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(SESSION_ID);
  });

  it("404s when the session belongs to a different user", async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ userId: 'someone-else' }));

    const res = await request(app).get(`/sessions/${SESSION_ID}`).set(authHeaderFor(USER_ID));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('runs submit-symptoms end to end and lands on the state matching urgencyLevel', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession());
    prisma.patientDetails.findUnique.mockResolvedValue({ birthDate: new Date('1995-01-01') });
    prisma.session.update.mockResolvedValue(baseSession({ currentState: 'S4_ai_triage_processing' }));
    runAiTriageAnalysis.mockResolvedValue({
      urgencyLevel: 'doctor_review',
      triageResultJson: { note: 'see a doctor' },
    });
    prisma.$transaction.mockResolvedValue([
      { id: 'tr-1' },
      baseSession({
        currentState: 'S5_pending_doctor_review',
        triageResult: { urgencyLevel: 'doctor_review', triageResultJson: { note: 'see a doctor' } },
      }),
    ]);

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/submit-symptoms`)
      .set(authHeaderFor(USER_ID))
      .send({
        presentingProblemId: 'problem-1',
        patientDetails: { gender: 'female' },
        answers: [{ questionId: 'q1', answer: 'yes' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.session.currentState).toBe('S5_pending_doctor_review');
    expect(res.body.session.triageResult.urgencyLevel).toBe('doctor_review');
  });

  it('rejects submit-symptoms when the session is not in S2', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S9_completed_triage' }));

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/submit-symptoms`)
      .set(authHeaderFor(USER_ID))
      .send({
        presentingProblemId: 'problem-1',
        patientDetails: { gender: 'female' },
        answers: [{ questionId: 'q1', answer: 'yes' }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects submit-symptoms when the user has no PatientDetails on file', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession());
    prisma.patientDetails.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/submit-symptoms`)
      .set(authHeaderFor(USER_ID))
      .send({
        presentingProblemId: 'problem-1',
        patientDetails: { gender: 'female' },
        answers: [{ questionId: 'q1', answer: 'yes' }],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PATIENT_DETAILS_MISSING');
  });

  it('auto-finalizes straight to S9 when urgencyLevel resolves to normal/home_treatment/emergency', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession());
    prisma.patientDetails.findUnique.mockResolvedValue({ birthDate: new Date('1995-01-01') });
    prisma.session.update.mockResolvedValue(baseSession({ currentState: 'S4_ai_triage_processing' }));
    runAiTriageAnalysis.mockResolvedValue({
      urgencyLevel: 'normal',
      triageResultJson: { note: 'all good' },
    });
    prisma.$transaction.mockResolvedValue([
      { id: 'tr-2' },
      baseSession({
        currentState: 'S9_completed_triage',
        triageResult: { urgencyLevel: 'normal', triageResultJson: { note: 'all good' } },
      }),
    ]);

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/submit-symptoms`)
      .set(authHeaderFor(USER_ID))
      .send({
        presentingProblemId: 'problem-1',
        patientDetails: { gender: 'female' },
        answers: [],
      });

    expect(res.status).toBe(200);
    // Auto-finalized straight to S9 — Frontend must read urgencyLevel to
    // know which of emergency/home_treatment/normal this was.
    expect(res.body.session.currentState).toBe('S9_completed_triage');
    expect(res.body.session.triageResult.urgencyLevel).toBe('normal');
  });

  it('rejects a patient (non-staff) calling staff-finalize', async () => {
    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/staff-finalize`)
      .set(authHeaderFor(USER_ID, 'patient'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets staff finalize a session stuck in S5_pending_doctor_review', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S5_pending_doctor_review' }));
    prisma.session.update.mockResolvedValue(baseSession({ currentState: 'S9_completed_triage' }));

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/staff-finalize`)
      .set(authHeaderFor('staff-1', 'staff'));

    expect(res.status).toBe(200);
    expect(res.body.session.currentState).toBe('S9_completed_triage');
  });

  it('rejects staff-finalize on a session not in S5', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S2_collecting_information' }));

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/staff-finalize`)
      .set(authHeaderFor('staff-1', 'staff'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('closes a completed session', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S9_completed_triage' }));
    prisma.session.update.mockResolvedValue(
      baseSession({ currentState: 'S9_completed_triage', closedAt: new Date() }),
    );

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/close`)
      .set(authHeaderFor(USER_ID));

    expect(res.status).toBe(200);
    expect(res.body.session.closedAt).toBeTruthy();
  });

  it('rejects closing an already-closed session', async () => {
    prisma.session.findUnique.mockResolvedValue(
      baseSession({ currentState: 'S9_completed_triage', closedAt: new Date() }),
    );

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/close`)
      .set(authHeaderFor(USER_ID));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_ALREADY_CLOSED');
  });

  it('cancels a session from any non-terminal state', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S2_collecting_information' }));
    prisma.session.update.mockResolvedValue(
      baseSession({ currentState: 'S10_cancelled_by_user', cancelledAt: new Date() }),
    );

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/cancel`)
      .set(authHeaderFor(USER_ID));

    expect(res.status).toBe(200);
    expect(res.body.session.currentState).toBe('S10_cancelled_by_user');
  });

  it('rejects cancelling an already-terminal session', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession({ currentState: 'S10_cancelled_by_user' }));

    const res = await request(app)
      .post(`/sessions/${SESSION_ID}/cancel`)
      .set(authHeaderFor(USER_ID));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});

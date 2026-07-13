jest.mock('../src/config/prismaClient', () => ({
  auditLog: { create: jest.fn() },
  errorLog: { create: jest.fn() },
}));

const prisma = require('../src/config/prismaClient');
const { recordAudit } = require('../src/services/auditLogService');
const { recordError } = require('../src/services/errorLogService');

describe('auditLogService.recordAudit', () => {
  afterEach(() => jest.clearAllMocks());

  it('writes an audit row with the given fields', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'a1' });

    await recordAudit({
      userId: 'user-1',
      action: 'session_created',
      entityType: 'Session',
      entityId: 'session-1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'session_created',
        entityType: 'Session',
        entityId: 'session-1',
        metadata: null,
      },
    });
  });

  it('never throws when the write itself fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(recordAudit({ action: 'x' })).resolves.toBeUndefined();
  });
});

describe('errorLogService.recordError', () => {
  afterEach(() => jest.clearAllMocks());

  it('writes an error row with the given fields', async () => {
    prisma.errorLog.create.mockResolvedValue({ id: 'e1' });

    await recordError({ message: 'boom', statusCode: 500, path: '/sessions', method: 'POST' });

    expect(prisma.errorLog.create).toHaveBeenCalledWith({
      data: {
        code: null,
        message: 'boom',
        stack: null,
        path: '/sessions',
        method: 'POST',
        statusCode: 500,
        userId: null,
      },
    });
  });

  it('never throws when the write itself fails', async () => {
    prisma.errorLog.create.mockRejectedValue(new Error('db down'));
    await expect(recordError({ message: 'boom' })).resolves.toBeUndefined();
  });
});

const { toAiPatientResponses } = require('../src/services/aiTriageGateway');

describe('toAiPatientResponses', () => {
  it('flattens presentingProblemId/patientDetails into reserved questionIds ahead of the clinical answers', () => {
    const result = toAiPatientResponses({
      presentingProblemId: 'sore_throat',
      patientDetails: { age: 34, gender: 'female' },
      answers: [{ questionId: 'q1', answer: 'yes' }],
    });

    expect(result).toEqual([
      { questionId: 'presenting_complaint', answer: 'sore_throat' },
      { questionId: 'age', answer: 34 },
      { questionId: 'gender', answer: 'female' },
      { questionId: 'q1', answer: 'yes' },
    ]);
  });

  it('omits reserved entries that are missing instead of sending them as null/undefined', () => {
    const result = toAiPatientResponses({
      presentingProblemId: 'headache',
      patientDetails: {},
      answers: [],
    });

    expect(result).toEqual([{ questionId: 'presenting_complaint', answer: 'headache' }]);
  });
});

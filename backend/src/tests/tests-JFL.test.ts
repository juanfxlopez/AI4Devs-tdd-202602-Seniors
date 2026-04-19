jest.mock('@prisma/client', () => {
  class PrismaClient {
    candidate = {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    };
    education = {
      create: jest.fn(),
      update: jest.fn(),
    };
    workExperience = {
      create: jest.fn(),
      update: jest.fn(),
    };
    resume = {
      create: jest.fn(),
    };
  }

  const Prisma = {
    PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
  };

  return { PrismaClient, Prisma };
});

import { addCandidate } from '../application/services/candidateService';
import { validateCandidateData } from '../application/validator';
import { Candidate } from '../domain/models/Candidate';
import { Education } from '../domain/models/Education';
import { WorkExperience } from '../domain/models/WorkExperience';
import { Resume } from '../domain/models/Resume';

const repeat = (char: string, count: number) => new Array(count).fill(char).join('');

describe('Add candidate - form data reception (validateCandidateData)', () => {
  test('accepts a valid minimal payload (no optional fields)', () => {
    // Arrange
    const payload = {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan.perez@example.com',
    };

    // Act / Assert
    expect(() => validateCandidateData(payload)).not.toThrow();
  });

  test('skips validation entirely when id is provided (edit flow)', () => {
    // Arrange
    const payload = {
      id: 123,
      firstName: '',
      lastName: '',
      email: 'not-an-email',
      phone: 'abc',
    };

    // Act / Assert
    expect(() => validateCandidateData(payload)).not.toThrow();
  });

  describe('required fields', () => {
    test.each([
      ['firstName', { lastName: 'Doe', email: 'a@b.com' }],
      ['lastName', { firstName: 'John', email: 'a@b.com' }],
      ['email', { firstName: 'John', lastName: 'Doe' }],
    ])('rejects when %s is missing', (_field, payload) => {
      // Arrange / Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(Error);
    });

    test.each([
      ['firstName', { firstName: undefined, lastName: 'Doe', email: 'a@b.com' }],
      ['lastName', { firstName: 'John', lastName: undefined, email: 'a@b.com' }],
      ['email', { firstName: 'John', lastName: 'Doe', email: undefined }],
    ])('rejects when %s is undefined', (_field, payload) => {
      // Arrange / Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(Error);
    });

    test.each([
      ['firstName', { firstName: null, lastName: 'Doe', email: 'a@b.com' }],
      ['lastName', { firstName: 'John', lastName: null, email: 'a@b.com' }],
      ['email', { firstName: 'John', lastName: 'Doe', email: null }],
    ])('rejects when %s is null', (_field, payload) => {
      // Arrange / Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(Error);
    });

    test.each([
      [
        'firstName',
        { firstName: '', lastName: 'Doe', email: 'a@b.com' },
        'Invalid name',
      ],
      [
        'lastName',
        { firstName: 'John', lastName: '', email: 'a@b.com' },
        'Invalid name',
      ],
    ])('rejects when %s is empty string', (_field, payload, message) => {
      // Arrange / Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(message);
    });
  });

  describe('name validation', () => {
    test.each([
      ['too short (1 char)', 'A'],
      ['too long (101 chars)', repeat('A', 101)],
      ['contains digits', 'John2'],
      ['contains disallowed punctuation', 'John_Doe'],
    ])('rejects invalid firstName: %s', (_label, firstName) => {
      // Arrange
      const payload = {
        firstName,
        lastName: 'Doe',
        email: 'a@b.com',
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid name');
    });

    test('accepts names with spaces and accented characters', () => {
      // Arrange
      const payload = {
        firstName: 'José Ángel',
        lastName: 'Muñoz Ñáñez',
        email: 'jose.angel@example.com',
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).not.toThrow();
    });
  });

  describe('email validation', () => {
    test.each([
      ['missing @', 'john.doe.example.com'],
      ['missing domain', 'john@'],
      ['missing TLD', 'john@example'],
      ['empty', ''],
    ])('rejects invalid email: %s', (_label, email) => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email,
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid email');
    });
  });

  describe('phone validation', () => {
    test.each([
      ['too short', '61234567'],
      ['too long', '6123456789'],
      ['invalid starting digit', '112345678'],
      ['non-numeric', '6abcdefghi'],
    ])('rejects invalid phone: %s', (_label, phone) => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        phone,
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid phone');
    });

    test.each([['612345678'], ['712345678'], ['912345678']])(
      'accepts valid phone %s',
      (phone) => {
        // Arrange
        const payload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@doe.com',
          phone,
        };

        // Act / Assert
        expect(() => validateCandidateData(payload)).not.toThrow();
      },
    );
  });

  describe('address validation', () => {
    test('rejects when address exceeds 100 characters', () => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        address: repeat('a', 101),
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid address');
    });

    test('accepts address at 100 characters boundary', () => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        address: repeat('a', 100),
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).not.toThrow();
    });
  });

  describe('education validation (educations)', () => {
    test('rejects when educations item is missing required fields', () => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        educations: [{}],
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid institution');
    });

    test.each([
      [
        'invalid startDate format',
        {
          institution: 'Uni',
          title: 'CS',
          startDate: '01-01-2020',
        },
        'Invalid date',
      ],
      [
        'invalid endDate format',
        {
          institution: 'Uni',
          title: 'CS',
          startDate: '2020-01-01',
          endDate: '2020/12/31',
        },
        'Invalid end date',
      ],
      [
        'institution exceeds 100 chars',
        {
          institution: repeat('a', 101),
          title: 'CS',
          startDate: '2020-01-01',
        },
        'Invalid institution',
      ],
      [
        'title exceeds 100 chars',
        {
          institution: 'Uni',
          title: repeat('a', 101),
          startDate: '2020-01-01',
        },
        'Invalid title',
      ],
    ])('rejects education: %s', (_label, education, message) => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        educations: [education],
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(message);
    });
  });

  describe('work experience validation (workExperiences)', () => {
    test.each([
      [
        'missing company',
        {
          position: 'Dev',
          startDate: '2020-01-01',
        },
        'Invalid company',
      ],
      [
        'missing position',
        {
          company: 'ACME',
          startDate: '2020-01-01',
        },
        'Invalid position',
      ],
      [
        'description exceeds 200 chars',
        {
          company: 'ACME',
          position: 'Dev',
          description: repeat('a', 201),
          startDate: '2020-01-01',
        },
        'Invalid description',
      ],
      [
        'invalid startDate format',
        {
          company: 'ACME',
          position: 'Dev',
          startDate: '2020/01/01',
        },
        'Invalid date',
      ],
      [
        'invalid endDate format',
        {
          company: 'ACME',
          position: 'Dev',
          startDate: '2020-01-01',
          endDate: '2020/12/31',
        },
        'Invalid end date',
      ],
    ])('rejects work experience: %s', (_label, experience, message) => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        workExperiences: [experience],
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow(message);
    });
  });

  describe('cv validation', () => {
    test.each([
      ['cv is not an object', 'not-an-object'],
      ['cv missing filePath', { fileType: 'application/pdf' }],
      ['cv missing fileType', { filePath: '/uploads/cv.pdf' }],
      ['cv filePath is not string', { filePath: 123, fileType: 'application/pdf' }],
      ['cv fileType is not string', { filePath: '/uploads/cv.pdf', fileType: 123 }],
    ])('rejects invalid cv: %s', (_label, cv) => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        cv,
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow('Invalid CV data');
    });

    test('does not validate cv when it is an empty object', () => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        cv: {},
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).not.toThrow();
    });
  });

  describe('malformed payload structures', () => {
    test('rejects when payload is null (non-object)', () => {
      // Arrange / Act / Assert
      expect(() => validateCandidateData(null)).toThrow();
    });

    test('rejects when educations is not an array (iterable leads to invalid items)', () => {
      // Arrange
      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
        educations: 'not-an-array',
      };

      // Act / Assert
      expect(() => validateCandidateData(payload)).toThrow();
    });
  });
});

describe('Add candidate - database save (service addCandidate)', () => {
  const candidateSaveSpy = jest.spyOn(Candidate.prototype, 'save');
  const educationSaveSpy = jest.spyOn(Education.prototype, 'save');
  const workExperienceSaveSpy = jest.spyOn(WorkExperience.prototype, 'save');
  const resumeSaveSpy = jest.spyOn(Resume.prototype, 'save');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves candidate and returns the saved candidate', async () => {
    // Arrange
    const payload = {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan.perez@example.com',
    };
    const savedCandidate = { id: 101, ...payload };

    candidateSaveSpy.mockResolvedValue(savedCandidate as any);
    educationSaveSpy.mockResolvedValue({} as any);
    workExperienceSaveSpy.mockResolvedValue({} as any);
    resumeSaveSpy.mockResolvedValue({} as any);

    // Act
    const result = await addCandidate(payload);

    // Assert
    expect(result).toEqual(savedCandidate);
    expect(candidateSaveSpy).toHaveBeenCalledTimes(1);
    expect(educationSaveSpy).not.toHaveBeenCalled();
    expect(workExperienceSaveSpy).not.toHaveBeenCalled();
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('does not attempt any persistence when validation fails', async () => {
    // Arrange
    const payload = {
      firstName: '',
      lastName: 'Doe',
      email: 'john@doe.com',
    };

    candidateSaveSpy.mockResolvedValue({ id: 1 } as any);

    // Act / Assert
    await expect(addCandidate(payload)).rejects.toThrow('Error: Invalid name');
    expect(candidateSaveSpy).not.toHaveBeenCalled();
    expect(educationSaveSpy).not.toHaveBeenCalled();
    expect(workExperienceSaveSpy).not.toHaveBeenCalled();
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('persists educations with candidateId after candidate is saved', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
      educations: [
        {
          institution: 'Uni',
          title: 'CS',
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        },
        {
          institution: 'Institute',
          title: 'Math',
          startDate: '2018-01-01',
        },
      ],
    };
    const savedCandidate = { id: 123, firstName: 'John', lastName: 'Doe', email: 'john@doe.com' };

    candidateSaveSpy.mockResolvedValue(savedCandidate as any);
    educationSaveSpy.mockImplementation(function (this: Education) {
      expect(this.candidateId).toBe(123);
      return Promise.resolve({} as any);
    });

    // Act
    const result = await addCandidate(payload);

    // Assert
    expect(result).toEqual(savedCandidate);
    expect(candidateSaveSpy).toHaveBeenCalledTimes(1);
    expect(educationSaveSpy).toHaveBeenCalledTimes(2);
    expect(workExperienceSaveSpy).not.toHaveBeenCalled();
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('persists work experiences with candidateId after candidate is saved', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
      workExperiences: [
        {
          company: 'ACME',
          position: 'Dev',
          description: 'Did stuff',
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        },
      ],
    };
    const savedCandidate = { id: 456, firstName: 'John', lastName: 'Doe', email: 'john@doe.com' };

    candidateSaveSpy.mockResolvedValue(savedCandidate as any);
    workExperienceSaveSpy.mockImplementation(function (this: WorkExperience) {
      expect(this.candidateId).toBe(456);
      return Promise.resolve({} as any);
    });

    // Act
    const result = await addCandidate(payload);

    // Assert
    expect(result).toEqual(savedCandidate);
    expect(candidateSaveSpy).toHaveBeenCalledTimes(1);
    expect(workExperienceSaveSpy).toHaveBeenCalledTimes(1);
    expect(educationSaveSpy).not.toHaveBeenCalled();
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('persists resume when cv is present and non-empty, setting candidateId', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
      cv: {
        filePath: '/uploads/cv.pdf',
        fileType: 'application/pdf',
      },
    };
    const savedCandidate = { id: 999, firstName: 'John', lastName: 'Doe', email: 'john@doe.com' };

    candidateSaveSpy.mockResolvedValue(savedCandidate as any);
    resumeSaveSpy.mockImplementation(function (this: Resume) {
      expect(this.candidateId).toBe(999);
      return Promise.resolve(this as any);
    });

    // Act
    const result = await addCandidate(payload);

    // Assert
    expect(result).toEqual(savedCandidate);
    expect(candidateSaveSpy).toHaveBeenCalledTimes(1);
    expect(resumeSaveSpy).toHaveBeenCalledTimes(1);
    expect(educationSaveSpy).not.toHaveBeenCalled();
    expect(workExperienceSaveSpy).not.toHaveBeenCalled();
  });

  test('does not persist resume when cv is an empty object', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
      cv: {},
    };
    const savedCandidate = { id: 1000, firstName: 'John', lastName: 'Doe', email: 'john@doe.com' };

    candidateSaveSpy.mockResolvedValue(savedCandidate as any);
    resumeSaveSpy.mockResolvedValue({} as any);

    // Act
    const result = await addCandidate(payload);

    // Assert
    expect(result).toEqual(savedCandidate);
    expect(candidateSaveSpy).toHaveBeenCalledTimes(1);
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('translates Prisma unique-constraint error code P2002 into a user-friendly message', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
    };

    candidateSaveSpy.mockRejectedValue({ code: 'P2002' });

    // Act / Assert
    await expect(addCandidate(payload)).rejects.toThrow(
      'The email already exists in the database',
    );
    expect(educationSaveSpy).not.toHaveBeenCalled();
    expect(workExperienceSaveSpy).not.toHaveBeenCalled();
    expect(resumeSaveSpy).not.toHaveBeenCalled();
  });

  test('propagates non-P2002 persistence errors as-is', async () => {
    // Arrange
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
    };
    const error = new Error('DB is down');

    candidateSaveSpy.mockRejectedValue(error);

    // Act / Assert
    await expect(addCandidate(payload)).rejects.toThrow('DB is down');
  });

  test('throws a wrapped error when payload is malformed (null)', async () => {
    // Arrange
    candidateSaveSpy.mockResolvedValue({ id: 1 } as any);

    // Act / Assert
    await expect(addCandidate(null as any)).rejects.toThrow(/Cannot read|null/i);
    expect(candidateSaveSpy).not.toHaveBeenCalled();
  });
});

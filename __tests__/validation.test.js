// __tests__/validation.test.js - Basic validation tests (no Jest required)
// These tests can run directly in Node.js without dependencies

// Simple test framework
class TestRunner {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.tests = [];
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    run() {
        console.log('\n🧪 Running Tests...\n');
        
        this.tests.forEach(({ name, fn }) => {
            try {
                fn();
                this.passed++;
                console.log(`✅ PASS: ${name}`);
            } catch (error) {
                this.failed++;
                console.log(`❌ FAIL: ${name}`);
                console.log(`   Error: ${error.message}`);
            }
        });

        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
        return this.failed === 0;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || 'Expected true, got false');
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || 'Expected false, got true');
    }
}

// Test ISEP validation
function isValidISEP(idISEP) {
    if (!idISEP) return false;
    const formatted = String(idISEP).trim().toUpperCase().padStart(4, '0');
    return /^[0-9A-F]{4}$/.test(formatted);
}

function formatISEP(idISEP) {
    if (!idISEP) return null;
    let formatted = String(idISEP).trim().toUpperCase();
    formatted = formatted.padStart(4, '0');
    return isValidISEP(formatted) ? formatted : null;
}

// Run tests
const runner = new TestRunner();

// ISEP Validation Tests
runner.test('Valid ISEP: 0001', () => {
    assertTrue(isValidISEP('0001'), 'Should accept valid 4-digit ISEP');
});

runner.test('Valid ISEP: 1234', () => {
    assertTrue(isValidISEP('1234'), 'Should accept valid 4-digit ISEP');
});

runner.test('Valid ISEP with hex: ABCD', () => {
    assertTrue(isValidISEP('ABCD'), 'Should accept valid hex ISEP');
});

runner.test('Valid ISEP with hex: 1A2B', () => {
    assertTrue(isValidISEP('1A2B'), 'Should accept valid hex ISEP');
});

runner.test('Invalid ISEP: null', () => {
    assertFalse(isValidISEP(null), 'Should reject null');
});

runner.test('Invalid ISEP: empty string', () => {
    assertFalse(isValidISEP(''), 'Should reject empty string');
});

runner.test('Invalid ISEP: too long', () => {
    assertFalse(isValidISEP('12345'), 'Should reject ISEP longer than 4 digits');
});

runner.test('Invalid ISEP: invalid characters', () => {
    assertFalse(isValidISEP('12GZ'), 'Should reject ISEP with invalid hex characters');
});

runner.test('Invalid ISEP: special characters', () => {
    assertFalse(isValidISEP('12@#'), 'Should reject ISEP with special characters');
});

// ISEP Formatting Tests
runner.test('Format ISEP: 1 -> 0001', () => {
    assertEqual(formatISEP('1'), '0001', 'Should pad single digit to 4 digits');
});

runner.test('Format ISEP: 12 -> 0012', () => {
    assertEqual(formatISEP('12'), '0012', 'Should pad to 4 digits');
});

runner.test('Format ISEP: abc -> 0ABC', () => {
    assertEqual(formatISEP('abc'), '0ABC', 'Should uppercase and pad hex values');
});

runner.test('Format ISEP: 1234 -> 1234', () => {
    assertEqual(formatISEP('1234'), '1234', 'Should keep valid 4-digit ISEP as is');
});

runner.test('Format ISEP: null -> null', () => {
    assertEqual(formatISEP(null), null, 'Should return null for null input');
});

runner.test('Format ISEP: invalid -> null', () => {
    assertEqual(formatISEP('GGGG'), null, 'Should return null for invalid ISEP');
});

runner.test('Format ISEP: with spaces', () => {
    assertEqual(formatISEP(' 123 '), '0123', 'Should trim spaces and format');
});

// Command ID Generation Tests
let commandIdCounter = 0;

function generateCommandId() {
    const timestamp = Date.now();
    commandIdCounter = (commandIdCounter + 1) % 1000;
    return timestamp * 1000 + commandIdCounter;
}

runner.test('Command ID: generates unique IDs', () => {
    const id1 = generateCommandId();
    const id2 = generateCommandId();
    assertTrue(id1 !== id2, 'Should generate different IDs');
});

runner.test('Command ID: sequential calls produce different IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) {
        ids.add(generateCommandId());
    }
    assertEqual(ids.size, 10, 'All 10 IDs should be unique');
});

// Run all tests
const success = runner.run();
process.exit(success ? 0 : 1);

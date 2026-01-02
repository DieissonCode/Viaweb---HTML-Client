# Tests

This directory contains validation tests for the Viaweb application.

## Running Tests

The tests are written in plain JavaScript and don't require Jest or any other testing framework.

```bash
# Run all tests
node __tests__/validation.test.js
```

## Test Coverage

- **ISEP Validation**: Tests for validating ISEP format (4 hex digits)
- **ISEP Formatting**: Tests for formatting and padding ISEP values
- **Command ID Generation**: Tests for unique command ID generation

## Adding New Tests

Use the simple test framework provided:

```javascript
runner.test('Test name', () => {
    assertEqual(actual, expected, 'Error message');
    assertTrue(condition, 'Error message');
    assertFalse(condition, 'Error message');
});
```

All tests will run automatically when you execute the test file.

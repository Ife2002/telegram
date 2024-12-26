/**
 * Converts any decimal number to a precise BigInt representation
 * Multiplies by 10^6 to preserve 6 decimal places
 * @param {number|string} input - The number to convert
 * @returns {bigint} - The precise BigInt representation
 */
export function toBigIntPrecise(input) {
    // Handle null/undefined
    if (input == null) {
        throw new Error('Input cannot be null or undefined');
    }

    // Convert input to string, handling various number formats
    let strNum = '';
    if (typeof input === 'string') {
        // Remove any whitespace
        strNum = input.trim();
        // Validate string is a valid number
        if (!/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(strNum)) {
            throw new Error('Invalid number format');
        }
    } else if (typeof input === 'number') {
        if (!Number.isFinite(input)) {
            throw new Error('Input must be a finite number');
        }
        // Convert to string using fixed notation to handle scientific notation
        strNum = input.toFixed(20);
    } else {
        throw new Error('Input must be a number or string');
    }

    // Split into integer and decimal parts
    const [integerPart, decimalPart = ''] = strNum.split('.');
    
    // Handle negative numbers
    const isNegative = integerPart.startsWith('-');
    const absIntegerPart = isNegative ? integerPart.slice(1) : integerPart;

    // Pad or truncate decimal part to 6 places
    const normalizedDecimal = decimalPart.padEnd(6, '0').slice(0, 6);
    
    // Combine parts
    let combinedStr = `${absIntegerPart}${normalizedDecimal}`;
    
    // Remove leading zeros but keep at least one digit
    combinedStr = combinedStr.replace(/^0+(?=\d)/, '') || '0';
    
    // Apply negative sign if needed
    if (isNegative) {
        combinedStr = `-${combinedStr}`;
    }

    // Convert to BigInt
    try {
        return BigInt(combinedStr);
    } catch (error) {
        throw new Error(`Failed to convert to BigInt: ${error.message}`);
    }
}

/**
 * Converts BigInt back to decimal number
 * @param {bigint} bigIntValue 
 * @returns {number}
 */
function fromBigIntPrecise(bigIntValue) {
    if (typeof bigIntValue !== 'bigint') {
        throw new Error('Input must be a BigInt');
    }
    return Number(bigIntValue) / 1_000_000;
}

// Validation wrapper for production use
function validateAndConvertToBigInt(input) {
    try {
        const result = toBigIntPrecise(input);
        // Verify conversion is reversible within acceptable tolerance
        const backToNumber = fromBigIntPrecise(result);
        const originalNumber = typeof input === 'string' ? Number(input) : input;
        const tolerance = 1e-6;
        
        if (Math.abs(backToNumber - originalNumber) > tolerance) {
            throw new Error('Conversion validation failed: precision loss detected');
        }
        
        return result;
    } catch (error) {
        throw new Error(`Validation failed: ${error.message}`);
    }
}

// Example usage and tests
const testCases = [
    // Basic cases
    123.456789,
    0.123456789,
    
    // Edge cases
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    0.000001,
    0.0000001, // Should round to 0
    
    // Scientific notation
    1.23e-7,
    1.23e7,
    
    // String inputs
    "123.456789",
    "0.123456789",
    
    // Negative numbers
    -123.456789,
    -0.123456789,
    
    // Zero cases
    0,
    "0",
    "0.0",
    
    // Floating point precision edge cases
    0.1 + 0.2,
    0.3 - 0.1,
    1.999999999999999,
    
    // Very large and small numbers
    999999999.999999,
    0.000000000000001
];

// Run tests
testCases.forEach(test => {
    try {
        const bigIntValue = validateAndConvertToBigInt(test);
        const backToNumber = fromBigIntPrecise(bigIntValue);
        console.log({
            input: test,
            inputType: typeof test,
            bigIntValue: bigIntValue.toString(),
            backToNumber,
            matchesOriginal: Math.abs(backToNumber - Number(test)) < 1e-6
        });
    } catch (error) {
        console.error(`Error testing ${test}: ${error.message}`);
    }
});
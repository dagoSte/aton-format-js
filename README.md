# ATON - Adaptive Token-Oriented Notation

[![npm version](https://badge.fury.io/js/aton-format.svg)](https://www.npmjs.com/package/aton-format)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ATON** is a token-efficient data serialization format designed specifically for LLM applications. It reduces token usage by up to 55% compared to JSON while maintaining perfect data fidelity.

## V2 Features

- **Compression Modes**: FAST, BALANCED, ULTRA, ADAPTIVE
- **Query Language**: SQL-like syntax with full AST parser
- **Streaming Encoder**: Process large datasets in chunks
- **Dictionary Compression**: Automatic string deduplication
- **Full TypeScript Support**: Complete type definitions
- **Dual Module**: Works with both ESM and CommonJS
- **Zero Dependencies**: Lightweight and fast

## Installation

```bash
npm install aton-format
```

```bash
yarn add aton-format
```

```bash
pnpm add aton-format
```

## Quick Start

### ESM (Recommended)

```typescript
import { ATONEncoder, ATONDecoder, CompressionMode } from 'aton-format';

// Create encoder with compression
const encoder = new ATONEncoder({
    compression: CompressionMode.BALANCED,
    optimize: true
});

const data = {
    employees: [
        { id: 1, name: "Alice", role: "Engineer", active: true },
        { id: 2, name: "Bob", role: "Designer", active: true },
        { id: 3, name: "Carol", role: "Manager", active: true }
    ]
};

const atonText = encoder.encode(data);
console.log(atonText);
// Output:
// @schema[id:int, name:str, role:str, active:bool]
// @defaults[active:true]
//
// employees(3):
//   1, "Alice", "Engineer"
//   2, "Bob", "Designer"
//   3, "Carol", "Manager"

// Decode back
const decoder = new ATONDecoder();
const original = decoder.decode(atonText);
```

### CommonJS

```javascript
const { ATONEncoder, ATONDecoder, CompressionMode } = require('aton-format');

const encoder = new ATONEncoder({ compression: CompressionMode.FAST });
const atonText = encoder.encode(data);
```

## Compression Modes

```typescript
import { ATONEncoder, CompressionMode } from 'aton-format';

// Fast: No dictionary compression, fastest encoding
const fast = new ATONEncoder({ compression: CompressionMode.FAST });

// Balanced: Good compression with reasonable speed (default)
const balanced = new ATONEncoder({ compression: CompressionMode.BALANCED });

// Ultra: Maximum compression, best for large datasets
const ultra = new ATONEncoder({ compression: CompressionMode.ULTRA });

// Adaptive: Automatically selects mode based on data size
const adaptive = new ATONEncoder({ compression: CompressionMode.ADAPTIVE });
```

## Query Language

ATON supports SQL-like queries for filtering data:

```typescript
import { ATONEncoder, ATONQueryEngine } from 'aton-format';

const encoder = new ATONEncoder();
const queryEngine = new ATONQueryEngine();

const data = {
    products: [
        { id: 1, name: "Laptop", price: 999, category: "Electronics" },
        { id: 2, name: "Mouse", price: 29, category: "Electronics" },
        { id: 3, name: "Desk", price: 299, category: "Furniture" }
    ]
};

// Parse and execute query
const query = queryEngine.parse("products WHERE price > 100 ORDER BY price DESC LIMIT 10");
const results = queryEngine.execute(data, query);

// Or encode with query directly
const filteredAton = encoder.encodeWithQuery(data, "products WHERE category = 'Electronics'");
```

### Query Syntax

```sql
-- Basic filtering
products WHERE price > 100

-- Multiple conditions
products WHERE price > 100 AND category = 'Electronics'

-- OR conditions
products WHERE category = 'Electronics' OR category = 'Furniture'

-- IN operator
products WHERE category IN ('Electronics', 'Furniture')

-- LIKE operator (pattern matching)
products WHERE name LIKE '%Laptop%'

-- BETWEEN
products WHERE price BETWEEN 100 AND 500

-- Sorting and pagination
products WHERE active = true ORDER BY price DESC LIMIT 10 OFFSET 5

-- Select specific fields
products SELECT id, name WHERE price > 100
```

## Streaming Encoder

For large datasets, use the streaming encoder:

```typescript
import { ATONStreamEncoder, CompressionMode } from 'aton-format';

const streamEncoder = new ATONStreamEncoder({
    chunkSize: 100,
    compression: CompressionMode.BALANCED
});

const largeData = {
    records: Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        value: Math.random()
    }))
};

// Process in chunks
for (const chunk of streamEncoder.streamEncode(largeData)) {
    console.log(`Chunk ${chunk.chunkId + 1}/${chunk.totalChunks}`);
    console.log(`Progress: ${(chunk.metadata.progress * 100).toFixed(1)}%`);

    // Process chunk.data
    sendToAPI(chunk.data);
}
```

## API Reference

### ATONEncoder

```typescript
const encoder = new ATONEncoder(options?: ATONEncoderOptions);
```

**Options:**
- `optimize` (boolean, default: `true`): Enable schema and defaults optimization
- `compression` (CompressionMode, default: `BALANCED`): Compression mode
- `queryable` (boolean, default: `false`): Add queryable markers
- `validate` (boolean, default: `true`): Validate input data

**Methods:**
- `encode(data, compress?)`: Encode object to ATON
- `encodeWithQuery(data, queryString)`: Encode with query filtering
- `estimateTokens(text)`: Estimate token count
- `getCompressionStats(data)`: Get compression statistics

### ATONDecoder

```typescript
const decoder = new ATONDecoder(options?: ATONDecoderOptions);
```

**Options:**
- `validate` (boolean, default: `true`): Validate decoded data

**Methods:**
- `decode(atonStr)`: Decode ATON string to object

### ATONQueryEngine

```typescript
const queryEngine = new ATONQueryEngine();
```

**Methods:**
- `parse(queryString)`: Parse query to AST
- `execute(data, parsedQuery)`: Execute query on data

### ATONStreamEncoder

```typescript
const streamEncoder = new ATONStreamEncoder(options?: StreamEncoderOptions);
```

**Options:**
- `chunkSize` (number, default: `100`): Records per chunk
- `compression` (CompressionMode, default: `BALANCED`): Compression mode

**Methods:**
- `streamEncode(data, tableName?)`: Generator yielding chunks

## ATON Format Specification

### Basic Structure

```
@dict[#0:"repeated string", #1:"another string"]
@schema[field1:type1, field2:type2, ...]
@defaults[field1:value1, field2:value2, ...]

entityName(count):
  value1, value2, ...
  value1, value2, ...
```

### Supported Types

| Type | Description | Example |
|------|-------------|---------|
| `int` | Integer | `42` |
| `float` | Floating point | `3.14` |
| `str` | String | `"hello"` |
| `bool` | Boolean | `true`, `false` |
| `null` | Null value | `null` |
| `array` | Array | `[1,2,3]` |
| `object` | Object | `{key:value}` |

## Performance

| Dataset | JSON Tokens | ATON Tokens | Reduction |
|---------|-------------|-------------|-----------|
| Employee Records (1K) | 12,450 | 5,280 | 57.6% |
| Product Catalog (10K) | 145,200 | 64,800 | 55.4% |
| Transaction Log (100K) | 1,856,000 | 815,000 | 56.1% |

## Browser Usage

```html
<script type="module">
import { ATONEncoder, ATONDecoder, CompressionMode } from 'aton-format';

const encoder = new ATONEncoder({ compression: CompressionMode.FAST });
// ...
</script>
```

## Links

- [GitHub Repository](https://github.com/dagoSte/aton-format-js)
- [npm Package](https://www.npmjs.com/package/aton-format)
- [Python Package (PyPI)](https://pypi.org/project/aton-format/)
- [PHP Package (Packagist)](https://packagist.org/packages/dagost/aton-format)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Stefano D'Agostino**

- GitHub: [@dagoSte](https://github.com/dagoSte)
- Email: dago.stefano@gmail.com

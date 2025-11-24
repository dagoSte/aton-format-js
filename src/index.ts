/**
 * ATON.js v2.0.1 - Adaptive Token-Oriented Notation
 * TypeScript Implementation - Production Grade
 *
 * Features:
 * - Compression Modes (Fast, Balanced, Ultra, Adaptive)
 * - Query Language (SQL-like with AST parser)
 * - Streaming Encoder
 * - Full error handling
 * - Zero compromises
 *
 * @version 2.0.2
 * @author Stefano D'Agostino
 * @license MIT
 */

// ========================================================================
// ENUMS & CONSTANTS
// ========================================================================

/**
 * Compression modes
 */
export const CompressionMode = {
    FAST: 'fast',
    BALANCED: 'balanced',
    ULTRA: 'ultra',
    ADAPTIVE: 'adaptive'
} as const;

export type CompressionModeType = typeof CompressionMode[keyof typeof CompressionMode];

/**
 * Query operators
 */
export const QueryOperator = {
    EQ: '=',
    NEQ: '!=',
    LT: '<',
    GT: '>',
    LTE: '<=',
    GTE: '>=',
    LIKE: 'LIKE',
    IN: 'IN',
    NOT_IN: 'NOT IN',
    BETWEEN: 'BETWEEN'
} as const;

export type QueryOperatorType = typeof QueryOperator[keyof typeof QueryOperator];

/**
 * Logical operators
 */
export const LogicalOperator = {
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT'
} as const;

export type LogicalOperatorType = typeof LogicalOperator[keyof typeof LogicalOperator];

/**
 * Sort order
 */
export const SortOrder = {
    ASC: 'ASC',
    DESC: 'DESC'
} as const;

export type SortOrderType = typeof SortOrder[keyof typeof SortOrder];

/**
 * ATON types
 */
export const ATONType = {
    INT: 'int',
    FLOAT: 'float',
    STR: 'str',
    BOOL: 'bool',
    ARRAY: 'array',
    OBJECT: 'object',
    NULL: 'null'
} as const;

export type ATONTypeValue = typeof ATONType[keyof typeof ATONType];

// ========================================================================
// INTERFACES
// ========================================================================

export interface ATONEncoderOptions {
    optimize?: boolean;
    compression?: CompressionModeType;
    queryable?: boolean;
    validate?: boolean;
}

export interface ATONDecoderOptions {
    validate?: boolean;
}

export interface StreamEncoderOptions {
    chunkSize?: number;
    compression?: CompressionModeType;
}

export interface ChunkInfo {
    chunkId: number;
    totalChunks: number;
    data: string;
    isFirst: boolean;
    isLast: boolean;
    metadata: {
        table: string;
        recordsInChunk: number;
        startIdx: number;
        endIdx: number;
        totalRecords: number;
        progress: number;
    };
}

export interface CompressionResult {
    compressed: Record<string, unknown[]>;
    metadata: {
        dictionary: Record<string, string>;
        encodingTimeMs?: number;
    };
}

export interface CompressionStats {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    modeUsed: CompressionModeType;
    dictionarySize: number;
    encodingTimeMs: number;
    savingsPercent: number;
}

export interface ParsedQuery {
    table: string;
    selectFields: string[] | null;
    whereExpression: QueryExpression | null;
    orderBy: string | null;
    orderDirection: SortOrderType;
    limit: number | null;
    offset: number;
}

export interface Token {
    type: string;
    value: string;
}

// ========================================================================
// EXCEPTIONS
// ========================================================================

export class ATONError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ATONError';
    }
}

export class ATONEncodingError extends ATONError {
    constructor(message: string) {
        super(message);
        this.name = 'ATONEncodingError';
    }
}

export class ATONDecodingError extends ATONError {
    constructor(message: string) {
        super(message);
        this.name = 'ATONDecodingError';
    }
}

export class ATONQueryError extends ATONError {
    constructor(message: string) {
        super(message);
        this.name = 'ATONQueryError';
    }
}

// ========================================================================
// QUERY LANGUAGE - TOKENIZER
// ========================================================================

class QueryTokenizer {
    private patterns: [string, RegExp][];

    constructor() {
        this.patterns = [
            ['SELECT', /\bSELECT\b/i],
            ['FROM', /\bFROM\b/i],
            ['WHERE', /\bWHERE\b/i],
            ['ORDER', /\bORDER\s+BY\b/i],
            ['LIMIT', /\bLIMIT\b/i],
            ['OFFSET', /\bOFFSET\b/i],
            ['AND', /\bAND\b/i],
            ['OR', /\bOR\b/i],
            ['NOT', /\bNOT\b/i],
            ['IN', /\bIN\b/i],
            ['LIKE', /\bLIKE\b/i],
            ['BETWEEN', /\bBETWEEN\b/i],
            ['ASC', /\bASC\b/i],
            ['DESC', /\bDESC\b/i],
            ['IDENTIFIER', /[a-zA-Z_][a-zA-Z0-9_]*/],
            ['NUMBER', /-?\d+\.?\d*/],
            ['STRING', /'[^']*'|"[^"]*"/],
            ['OPERATOR', /<=|>=|!=|<>|=|<|>/],
            ['COMMA', /,/],
            ['LPAREN', /\(/],
            ['RPAREN', /\)/],
            ['WHITESPACE', /\s+/]
        ];
    }

    tokenize(query: string): Token[] {
        const tokens: Token[] = [];
        let pos = 0;

        while (pos < query.length) {
            let matched = false;

            for (const [name, pattern] of this.patterns) {
                const regex = new RegExp('^' + pattern.source, pattern.flags);
                const match = query.slice(pos).match(regex);

                if (match) {
                    if (name !== 'WHITESPACE') {
                        tokens.push({ type: name, value: match[0] });
                    }
                    pos += match[0].length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new ATONQueryError(`Invalid character at position ${pos}: '${query[pos]}'`);
            }
        }

        return tokens;
    }
}

// ========================================================================
// QUERY LANGUAGE - CONDITION & EXPRESSION
// ========================================================================

export class QueryCondition {
    field: string;
    operator: QueryOperatorType;
    value: unknown;
    value2: unknown;

    constructor(field: string, operator: QueryOperatorType, value: unknown, value2: unknown = null) {
        this.field = field;
        this.operator = operator;
        this.value = value;
        this.value2 = value2;
    }

    evaluate(record: Record<string, unknown>): boolean {
        if (!(this.field in record)) {
            return false;
        }

        const recordValue = record[this.field];

        switch (this.operator) {
            case QueryOperator.EQ:
                return recordValue === this.value;
            case QueryOperator.NEQ:
                return recordValue !== this.value;
            case QueryOperator.LT:
                return (recordValue as number) < (this.value as number);
            case QueryOperator.GT:
                return (recordValue as number) > (this.value as number);
            case QueryOperator.LTE:
                return (recordValue as number) <= (this.value as number);
            case QueryOperator.GTE:
                return (recordValue as number) >= (this.value as number);
            case QueryOperator.LIKE:
                const pattern = (this.value as string).replace(/%/g, '.*').replace(/_/g, '.');
                return new RegExp(`^${pattern}$`, 'i').test(String(recordValue));
            case QueryOperator.IN:
                return (this.value as unknown[]).includes(recordValue);
            case QueryOperator.NOT_IN:
                return !(this.value as unknown[]).includes(recordValue);
            case QueryOperator.BETWEEN:
                return (recordValue as number) >= (this.value as number) &&
                       (recordValue as number) <= (this.value2 as number);
            default:
                return false;
        }
    }
}

export class QueryExpression {
    conditions: (QueryCondition | QueryExpression)[];
    logicalOp: LogicalOperatorType;

    constructor(conditions: (QueryCondition | QueryExpression)[], logicalOp: LogicalOperatorType = LogicalOperator.AND) {
        this.conditions = conditions;
        this.logicalOp = logicalOp;
    }

    evaluate(record: Record<string, unknown>): boolean {
        const results = this.conditions.map(item => item.evaluate(record));

        if (this.logicalOp === LogicalOperator.AND) {
            return results.every(r => r);
        } else if (this.logicalOp === LogicalOperator.OR) {
            return results.some(r => r);
        } else {
            return !results[0];
        }
    }
}

// ========================================================================
// QUERY LANGUAGE - PARSER
// ========================================================================

class QueryParser {
    private tokenizer: QueryTokenizer;
    private tokens: Token[] = [];
    private pos: number = 0;

    constructor() {
        this.tokenizer = new QueryTokenizer();
    }

    parse(queryString: string): ParsedQuery {
        const match = queryString.match(/@query\[(.*)\]/is);
        if (match) {
            queryString = match[1];
        }

        this.tokens = this.tokenizer.tokenize(queryString);
        this.pos = 0;

        const table = this.parseTable();
        const selectFields = this.peek('SELECT') ? this.parseSelect() : null;
        const whereExpr = this.peek('WHERE') ? this.parseWhere() : null;
        const [orderBy, orderDir] = this.peek('ORDER') ? this.parseOrderBy() : [null, SortOrder.ASC];
        const limit = this.peek('LIMIT') ? this.parseLimit() : null;
        const offset = this.peek('OFFSET') ? this.parseOffset() : 0;

        return {
            table,
            selectFields,
            whereExpression: whereExpr,
            orderBy,
            orderDirection: orderDir,
            limit,
            offset
        };
    }

    private current(): Token | null {
        return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
    }

    private peek(type: string): boolean {
        const token = this.current();
        return token !== null && token.type === type;
    }

    private consume(type: string): string {
        const token = this.current();
        if (!token || token.type !== type) {
            throw new ATONQueryError(`Expected ${type}, got ${token ? token.type : 'EOF'}`);
        }
        this.pos++;
        return token.value;
    }

    private parseTable(): string {
        return this.consume('IDENTIFIER');
    }

    private parseSelect(): string[] {
        this.consume('SELECT');
        const fields = [this.consume('IDENTIFIER')];

        while (this.peek('COMMA')) {
            this.consume('COMMA');
            fields.push(this.consume('IDENTIFIER'));
        }

        return fields;
    }

    private parseWhere(): QueryExpression {
        this.consume('WHERE');
        return this.parseOrExpression();
    }

    private parseOrExpression(): QueryExpression {
        const left = this.parseAndExpression();

        if (this.peek('OR')) {
            const conditions: (QueryCondition | QueryExpression)[] = [left];
            while (this.peek('OR')) {
                this.consume('OR');
                conditions.push(this.parseAndExpression());
            }
            return new QueryExpression(conditions, LogicalOperator.OR);
        }

        return left;
    }

    private parseAndExpression(): QueryExpression {
        const conditions: (QueryCondition | QueryExpression)[] = [this.parseCondition()];

        while (this.peek('AND')) {
            this.consume('AND');
            conditions.push(this.parseCondition());
        }

        return new QueryExpression(conditions, LogicalOperator.AND);
    }

    private parseCondition(): QueryCondition | QueryExpression {
        if (this.peek('LPAREN')) {
            this.consume('LPAREN');
            const expr = this.parseOrExpression();
            this.consume('RPAREN');
            return expr;
        }

        if (this.peek('NOT')) {
            this.consume('NOT');
            const inner = this.parseCondition();
            return new QueryExpression([inner], LogicalOperator.NOT);
        }

        const field = this.consume('IDENTIFIER');

        if (this.peek('IN') || this.peek('LIKE') || this.peek('BETWEEN')) {
            return this.parseSpecialCondition(field);
        }

        const opStr = this.consume('OPERATOR');
        const opMap: Record<string, QueryOperatorType> = {
            '=': QueryOperator.EQ,
            '!=': QueryOperator.NEQ,
            '<>': QueryOperator.NEQ,
            '<': QueryOperator.LT,
            '>': QueryOperator.GT,
            '<=': QueryOperator.LTE,
            '>=': QueryOperator.GTE
        };

        const operator = opMap[opStr];
        if (!operator) {
            throw new ATONQueryError(`Unknown operator: ${opStr}`);
        }

        const value = this.parseValue();
        return new QueryCondition(field, operator, value);
    }

    private parseSpecialCondition(field: string): QueryCondition {
        if (this.peek('IN')) {
            this.consume('IN');
            this.consume('LPAREN');

            const values = [this.parseValue()];
            while (this.peek('COMMA')) {
                this.consume('COMMA');
                values.push(this.parseValue());
            }

            this.consume('RPAREN');
            return new QueryCondition(field, QueryOperator.IN, values);
        } else if (this.peek('LIKE')) {
            this.consume('LIKE');
            const pattern = this.parseValue();
            return new QueryCondition(field, QueryOperator.LIKE, pattern);
        } else if (this.peek('BETWEEN')) {
            this.consume('BETWEEN');
            const val1 = this.parseValue();
            this.consume('AND');
            const val2 = this.parseValue();
            return new QueryCondition(field, QueryOperator.BETWEEN, val1, val2);
        }

        throw new ATONQueryError('Invalid special condition');
    }

    private parseValue(): unknown {
        if (this.peek('STRING')) {
            const value = this.consume('STRING');
            return value.slice(1, -1);
        } else if (this.peek('NUMBER')) {
            const value = this.consume('NUMBER');
            return value.includes('.') ? parseFloat(value) : parseInt(value);
        } else if (this.peek('IDENTIFIER')) {
            const value = this.consume('IDENTIFIER');
            const upper = value.toUpperCase();
            if (upper === 'TRUE') return true;
            if (upper === 'FALSE') return false;
            if (upper === 'NULL') return null;
            return value;
        }

        throw new ATONQueryError('Expected value');
    }

    private parseOrderBy(): [string, SortOrderType] {
        this.consume('ORDER');
        const field = this.consume('IDENTIFIER');

        let direction: SortOrderType = SortOrder.ASC;
        if (this.peek('ASC')) {
            this.consume('ASC');
        } else if (this.peek('DESC')) {
            this.consume('DESC');
            direction = SortOrder.DESC;
        }

        return [field, direction];
    }

    private parseLimit(): number {
        this.consume('LIMIT');
        return parseInt(this.consume('NUMBER'));
    }

    private parseOffset(): number {
        this.consume('OFFSET');
        return parseInt(this.consume('NUMBER'));
    }
}

// ========================================================================
// QUERY ENGINE
// ========================================================================

export class ATONQueryEngine {
    private parser: QueryParser;

    constructor() {
        this.parser = new QueryParser();
    }

    parse(queryString: string): ParsedQuery {
        return this.parser.parse(queryString);
    }

    execute(data: Record<string, unknown[]>, query: ParsedQuery): unknown[] {
        if (!(query.table in data)) {
            throw new ATONQueryError(`Table '${query.table}' not found`);
        }

        let records = [...data[query.table]] as Record<string, unknown>[];

        if (query.whereExpression) {
            records = records.filter(r => query.whereExpression!.evaluate(r));
        }

        if (query.selectFields) {
            records = records.map(record => {
                const projected: Record<string, unknown> = {};
                for (const field of query.selectFields!) {
                    if (field in record) {
                        projected[field] = record[field];
                    }
                }
                return projected;
            });
        }

        if (query.orderBy) {
            const reverse = query.orderDirection === SortOrder.DESC;
            records.sort((a, b) => {
                const aVal = (a[query.orderBy!] as number) || 0;
                const bVal = (b[query.orderBy!] as number) || 0;
                return reverse ? bVal - aVal : aVal - bVal;
            });
        }

        if (query.offset) {
            records = records.slice(query.offset);
        }

        if (query.limit) {
            records = records.slice(0, query.limit);
        }

        return records;
    }
}

// ========================================================================
// COMPRESSION ENGINE
// ========================================================================

class DictionaryCompression {
    private minLength: number;
    private minOccurrences: number;
    private dictionary: Record<string, string> = {};
    private refCounter: number = 0;

    constructor(minLength: number = 5, minOccurrences: number = 3) {
        this.minLength = minLength;
        this.minOccurrences = minOccurrences;
    }

    compress(data: Record<string, unknown[]>): { compressed: Record<string, unknown[]>; dictionary: Record<string, string> } {
        const strings = this.extractStrings(data);
        const stringCounts = this.countOccurrences(strings);

        this.dictionary = {};
        for (const [string, count] of Object.entries(stringCounts)) {
            if (string.length >= this.minLength &&
                count >= this.minOccurrences &&
                !string.startsWith('#')) {
                const ref = `#${this.refCounter++}`;
                this.dictionary[ref] = string;
            }
        }

        const reverseDict: Record<string, string> = {};
        for (const [ref, string] of Object.entries(this.dictionary)) {
            reverseDict[string] = ref;
        }

        const compressed = this.replaceStrings(data, reverseDict) as Record<string, unknown[]>;

        return { compressed, dictionary: this.dictionary };
    }

    private extractStrings(obj: unknown, strings: string[] = []): string[] {
        if (typeof obj === 'string') {
            strings.push(obj);
        } else if (Array.isArray(obj)) {
            for (const item of obj) {
                this.extractStrings(item, strings);
            }
        } else if (obj && typeof obj === 'object') {
            for (const value of Object.values(obj)) {
                this.extractStrings(value, strings);
            }
        }
        return strings;
    }

    private countOccurrences(strings: string[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const str of strings) {
            counts[str] = (counts[str] || 0) + 1;
        }
        return counts;
    }

    private replaceStrings(obj: unknown, refMap: Record<string, string>): unknown {
        if (typeof obj === 'string' && obj in refMap) {
            return refMap[obj];
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.replaceStrings(item, refMap));
        } else if (obj && typeof obj === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.replaceStrings(value, refMap);
            }
            return result;
        }
        return obj;
    }
}

class ATONCompressionEngine {
    private mode: CompressionModeType;

    constructor(mode: CompressionModeType = CompressionMode.BALANCED) {
        this.mode = mode;
    }

    compress(data: Record<string, unknown[]>): CompressionResult {
        const startTime = Date.now();

        let result: CompressionResult;

        switch (this.mode) {
            case CompressionMode.FAST:
                result = this.compressFast(data);
                break;
            case CompressionMode.BALANCED:
                result = this.compressBalanced(data);
                break;
            case CompressionMode.ULTRA:
                result = this.compressUltra(data);
                break;
            case CompressionMode.ADAPTIVE:
                result = this.compressAdaptive(data);
                break;
            default:
                result = { compressed: data, metadata: { dictionary: {} } };
        }

        result.metadata.encodingTimeMs = Date.now() - startTime;
        return result;
    }

    private compressFast(data: Record<string, unknown[]>): CompressionResult {
        return { compressed: data, metadata: { dictionary: {} } };
    }

    private compressBalanced(data: Record<string, unknown[]>): CompressionResult {
        const algo = new DictionaryCompression(5, 3);
        const { compressed, dictionary } = algo.compress(data);
        return { compressed, metadata: { dictionary } };
    }

    private compressUltra(data: Record<string, unknown[]>): CompressionResult {
        const algo = new DictionaryCompression(3, 2);
        const { compressed, dictionary } = algo.compress(data);
        return { compressed, metadata: { dictionary } };
    }

    private compressAdaptive(data: Record<string, unknown[]>): CompressionResult {
        const dataStr = JSON.stringify(data);
        const size = dataStr.length;

        if (size < 1000) {
            return this.compressFast(data);
        } else if (size < 10000) {
            return this.compressBalanced(data);
        } else {
            return this.compressUltra(data);
        }
    }
}

// ========================================================================
// STREAMING ENCODER
// ========================================================================

export class ATONStreamEncoder {
    private chunkSize: number;
    private compressionMode: CompressionModeType;
    private baseEncoder: ATONEncoder;

    constructor(options: StreamEncoderOptions = {}) {
        this.chunkSize = options.chunkSize ?? 100;
        this.compressionMode = options.compression ?? CompressionMode.BALANCED;
        this.baseEncoder = new ATONEncoder({ compression: this.compressionMode });
    }

    *streamEncode(data: Record<string, unknown[]>, tableName?: string): Generator<ChunkInfo> {
        if (!tableName) {
            const keys = Object.keys(data);
            if (keys.length !== 1) {
                throw new ATONEncodingError('Multiple tables, specify tableName');
            }
            tableName = keys[0];
        }

        const records = data[tableName];
        if (!Array.isArray(records)) {
            throw new ATONEncodingError(`Table '${tableName}' must be an array`);
        }

        const totalRecords = records.length;
        const totalChunks = Math.ceil(totalRecords / this.chunkSize);

        const schema = records.length > 0 ? this.inferSchema(records[0] as Record<string, unknown>) : [];
        const defaults = this.inferDefaults(records as Record<string, unknown>[]);

        for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
            const startIdx = chunkId * this.chunkSize;
            const endIdx = Math.min(startIdx + this.chunkSize, totalRecords);
            const chunkRecords = records.slice(startIdx, endIdx);

            let atonChunk: string;
            if (chunkId === 0) {
                const chunkData = { [tableName]: chunkRecords };
                atonChunk = this.baseEncoder.encode(chunkData);
            } else {
                atonChunk = this.encodeRowsOnly(chunkRecords as Record<string, unknown>[], schema, defaults, tableName);
            }

            yield {
                chunkId,
                totalChunks,
                data: atonChunk,
                isFirst: chunkId === 0,
                isLast: chunkId === totalChunks - 1,
                metadata: {
                    table: tableName,
                    recordsInChunk: chunkRecords.length,
                    startIdx,
                    endIdx,
                    totalRecords,
                    progress: (chunkId + 1) / totalChunks
                }
            };
        }
    }

    private inferSchema(record: Record<string, unknown>): [string, string][] {
        const schema: [string, string][] = [];
        for (const [key, value] of Object.entries(record)) {
            schema.push([key, this.inferType(value)]);
        }
        return schema;
    }

    private inferDefaults(records: Record<string, unknown>[]): Record<string, unknown> {
        if (records.length === 0) return {};

        const defaults: Record<string, unknown> = {};
        const sampleSize = Math.min(100, records.length);
        const fieldValues: Record<string, unknown[]> = {};

        for (const record of records.slice(0, sampleSize)) {
            for (const [key, value] of Object.entries(record)) {
                if (!fieldValues[key]) fieldValues[key] = [];
                fieldValues[key].push(value);
            }
        }

        for (const [field, values] of Object.entries(fieldValues)) {
            const valueCounts: Record<string, number> = {};
            for (const val of values) {
                const key = JSON.stringify(val);
                valueCounts[key] = (valueCounts[key] || 0) + 1;
            }

            let maxCount = 0;
            let mostCommon: unknown = null;
            for (const [val, count] of Object.entries(valueCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommon = JSON.parse(val);
                }
            }

            if (maxCount / values.length > 0.6) {
                defaults[field] = mostCommon;
            }
        }

        return defaults;
    }

    private inferType(value: unknown): string {
        if (value === null) return ATONType.NULL;
        if (typeof value === 'boolean') return ATONType.BOOL;
        if (typeof value === 'number') {
            return Number.isInteger(value) ? ATONType.INT : ATONType.FLOAT;
        }
        if (typeof value === 'string') return ATONType.STR;
        if (Array.isArray(value)) return ATONType.ARRAY;
        if (typeof value === 'object') return ATONType.OBJECT;
        return ATONType.STR;
    }

    private encodeRowsOnly(
        records: Record<string, unknown>[],
        schema: [string, string][],
        defaults: Record<string, unknown>,
        tableName: string
    ): string {
        const lines = [`\n${tableName}+(${records.length}):`];

        for (const record of records) {
            const values: string[] = [];
            for (const [fieldName] of schema) {
                const value = record[fieldName];
                if (fieldName in defaults && value === defaults[fieldName]) {
                    continue;
                }
                values.push(this.formatValue(value));
            }
            if (values.length > 0) {
                lines.push('  ' + values.join(', '));
            }
        }

        return lines.join('\n');
    }

    private formatValue(value: unknown): string {
        if (value === null) return 'null';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'string') {
            const escaped = value.replace(/"/g, '\\"');
            return `"${escaped}"`;
        }
        return String(value);
    }
}

// ========================================================================
// MAIN ENCODER
// ========================================================================

export class ATONEncoder {
    private optimize: boolean;
    private compression: CompressionModeType;
    private queryable: boolean;
    private validate: boolean;
    private compressionEngine: ATONCompressionEngine;
    private queryEngine: ATONQueryEngine;

    constructor(options: ATONEncoderOptions = {}) {
        this.optimize = options.optimize !== false;
        this.compression = options.compression ?? CompressionMode.BALANCED;
        this.queryable = options.queryable ?? false;
        this.validate = options.validate !== false;

        this.compressionEngine = new ATONCompressionEngine(this.compression);
        this.queryEngine = new ATONQueryEngine();
    }

    encode(data: Record<string, unknown[]>, compress: boolean = true): string {
        try {
            if (this.validate) {
                this.validateData(data);
            }

            let compressedData = data;
            let dictionary: Record<string, string> = {};

            if (compress && this.compression !== CompressionMode.FAST) {
                const result = this.compressionEngine.compress(data);
                compressedData = result.compressed;
                dictionary = result.metadata.dictionary || {};
            }

            const parts: string[] = [];

            if (Object.keys(dictionary).length > 0) {
                parts.push(this.formatDictionary(dictionary));
                parts.push('');
            }

            for (const [tableName, records] of Object.entries(compressedData)) {
                if (!Array.isArray(records)) continue;

                const schema = records.length > 0 ? this.inferSchema(records[0] as Record<string, unknown>) : [];
                const defaults = this.optimize ? this.inferDefaults(records as Record<string, unknown>[]) : {};

                parts.push(this.formatSchema(schema));

                if (Object.keys(defaults).length > 0) {
                    parts.push(this.formatDefaults(defaults));
                }

                if (this.queryable) {
                    parts.push(`@queryable[${tableName}]`);
                }

                parts.push('');
                parts.push(`${tableName}(${records.length}):`);

                for (const record of records) {
                    const row = this.formatRecord(record as Record<string, unknown>, schema, defaults);
                    parts.push('  ' + row);
                }
            }

            return parts.join('\n');

        } catch (error) {
            throw new ATONEncodingError(`Encoding failed: ${(error as Error).message}`);
        }
    }

    encodeWithQuery(data: Record<string, unknown[]>, queryString: string): string {
        try {
            const query = this.queryEngine.parse(`@query[${queryString}]`);
            const filteredRecords = this.queryEngine.execute(data, query);
            const filteredData = { [query.table]: filteredRecords };

            const aton = this.encode(filteredData as Record<string, unknown[]>);
            return `@query[${queryString}]\n\n${aton}`;

        } catch (error) {
            throw new ATONQueryError(`Query encoding failed: ${(error as Error).message}`);
        }
    }

    estimateTokens(text: string): number {
        const words = text.split(/\s+/).length;
        const chars = text.length;
        const punctuation = (text.match(/[,.;:()[\]{}]/g) || []).length;

        return Math.floor(chars / 4 + punctuation / 2 + words / 3);
    }

    getCompressionStats(originalData: Record<string, unknown[]>): CompressionStats {
        const startTime = Date.now();

        const originalAton = this.encode(originalData, false);
        const originalTokens = this.estimateTokens(originalAton);

        const result = this.compressionEngine.compress(originalData);
        const compressedAton = this.encode(result.compressed, true);
        const compressedTokens = this.estimateTokens(compressedAton);

        return {
            originalTokens,
            compressedTokens,
            compressionRatio: compressedTokens / originalTokens,
            modeUsed: this.compression,
            dictionarySize: Object.keys(result.metadata.dictionary || {}).length,
            encodingTimeMs: Date.now() - startTime,
            savingsPercent: ((originalTokens - compressedTokens) / originalTokens) * 100
        };
    }

    private validateData(data: Record<string, unknown[]>): void {
        if (!data || typeof data !== 'object') {
            throw new ATONEncodingError('Data must be an object');
        }

        for (const [tableName, records] of Object.entries(data)) {
            if (typeof tableName !== 'string') {
                throw new ATONEncodingError('Table names must be strings');
            }
            if (!Array.isArray(records)) {
                throw new ATONEncodingError(`Table '${tableName}' must be an array`);
            }
            for (let i = 0; i < records.length; i++) {
                if (!records[i] || typeof records[i] !== 'object') {
                    throw new ATONEncodingError(`Record ${i} in '${tableName}' must be an object`);
                }
            }
        }
    }

    private formatDictionary(dictionary: Record<string, string>): string {
        const entries: string[] = [];
        for (const [key, value] of Object.entries(dictionary).sort()) {
            const escaped = value.replace(/"/g, '\\"');
            entries.push(`${key}:"${escaped}"`);
        }
        return `@dict[${entries.join(', ')}]`;
    }

    private formatSchema(schema: [string, string][]): string {
        const fields = schema.map(([name, type]) => `${name}:${type}`);
        return `@schema[${fields.join(', ')}]`;
    }

    private formatDefaults(defaults: Record<string, unknown>): string {
        const entries: string[] = [];
        for (const [key, value] of Object.entries(defaults).sort()) {
            if (typeof value === 'string') {
                const escaped = value.replace(/"/g, '\\"');
                entries.push(`${key}:"${escaped}"`);
            } else if (typeof value === 'boolean') {
                entries.push(`${key}:${value ? 'true' : 'false'}`);
            } else if (value === null) {
                entries.push(`${key}:null`);
            } else {
                entries.push(`${key}:${value}`);
            }
        }
        return `@defaults[${entries.join(', ')}]`;
    }

    private formatRecord(record: Record<string, unknown>, schema: [string, string][], defaults: Record<string, unknown>): string {
        const values: string[] = [];

        for (const [fieldName] of schema) {
            const value = record[fieldName];

            if (fieldName in defaults && value === defaults[fieldName]) {
                continue;
            }

            if (value === null) {
                values.push('null');
            } else if (typeof value === 'boolean') {
                values.push(value ? 'true' : 'false');
            } else if (typeof value === 'string') {
                if (value.startsWith('#')) {
                    values.push(value);
                } else {
                    const escaped = value.replace(/"/g, '\\"');
                    values.push(`"${escaped}"`);
                }
            } else {
                values.push(String(value));
            }
        }

        return values.join(', ');
    }

    private inferSchema(record: Record<string, unknown>): [string, string][] {
        const schema: [string, string][] = [];
        for (const [key, value] of Object.entries(record)) {
            schema.push([key, this.inferType(value)]);
        }
        return schema;
    }

    private inferDefaults(records: Record<string, unknown>[]): Record<string, unknown> {
        if (records.length === 0) return {};

        const defaults: Record<string, unknown> = {};
        const sampleSize = Math.min(100, records.length);
        const fieldValues: Record<string, unknown[]> = {};

        for (const record of records.slice(0, sampleSize)) {
            for (const [key, value] of Object.entries(record)) {
                if (!fieldValues[key]) fieldValues[key] = [];
                fieldValues[key].push(value);
            }
        }

        for (const [field, values] of Object.entries(fieldValues)) {
            const valueCounts: Record<string, number> = {};
            for (const val of values) {
                const key = JSON.stringify(val);
                valueCounts[key] = (valueCounts[key] || 0) + 1;
            }

            let maxCount = 0;
            let mostCommon: unknown = null;
            for (const [val, count] of Object.entries(valueCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommon = JSON.parse(val);
                }
            }

            if (maxCount / values.length > 0.6) {
                defaults[field] = mostCommon;
            }
        }

        return defaults;
    }

    private inferType(value: unknown): string {
        if (value === null) return ATONType.NULL;
        if (typeof value === 'boolean') return ATONType.BOOL;
        if (typeof value === 'number') {
            return Number.isInteger(value) ? ATONType.INT : ATONType.FLOAT;
        }
        if (typeof value === 'string') return ATONType.STR;
        if (Array.isArray(value)) return ATONType.ARRAY;
        if (typeof value === 'object') return ATONType.OBJECT;
        return ATONType.STR;
    }
}

// ========================================================================
// DECODER
// ========================================================================

export class ATONDecoder {
    private validate: boolean;
    private dictionary: Record<string, string> = {};

    constructor(options: ATONDecoderOptions = {}) {
        this.validate = options.validate !== false;
    }

    decode(atonString: string): Record<string, unknown[]> {
        try {
            const lines = atonString.trim().split('\n');
            const result: Record<string, unknown[]> = {};
            let currentTable: string | null = null;
            let schema: [string, string][] = [];
            let defaults: Record<string, unknown> = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (!line) continue;

                if (line.startsWith('@dict')) {
                    this.dictionary = this.parseDictionary(line);
                } else if (line.startsWith('@schema')) {
                    schema = this.parseSchema(line);
                } else if (line.startsWith('@defaults')) {
                    defaults = this.parseDefaults(line);
                } else if (line.startsWith('@query') || line.startsWith('@queryable')) {
                    continue;
                } else if (line.includes('(') && line.endsWith('):')) {
                    const tableName = line.split('(')[0].trim();
                    currentTable = tableName;
                    result[tableName] = [];
                } else if (line.includes('+(') && line.endsWith('):')) {
                    continue;
                } else if (line && currentTable && !line.startsWith('@')) {
                    const record = this.parseRecord(line, schema, defaults);
                    if (record) {
                        result[currentTable].push(record);
                    }
                }
            }

            if (this.validate) {
                this.validateDecoded(result);
            }

            return result;

        } catch (error) {
            throw new ATONDecodingError(`Decoding failed: ${(error as Error).message}`);
        }
    }

    private parseDictionary(line: string): Record<string, string> {
        const content = this.extractBrackets(line);
        const dictionary: Record<string, string> = {};
        const entries = this.smartSplit(content, ',');

        for (const entry of entries) {
            if (entry.includes(':')) {
                const [key, value] = entry.split(':', 2);
                const unquoted = value.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"');
                dictionary[key.trim()] = unquoted;
            }
        }

        return dictionary;
    }

    private parseSchema(line: string): [string, string][] {
        const content = this.extractBrackets(line);
        const schema: [string, string][] = [];
        const fields = this.smartSplit(content, ',');

        for (const field of fields) {
            if (field.includes(':')) {
                const [name, type] = field.split(':', 2);
                schema.push([name.trim(), type.trim()]);
            }
        }

        return schema;
    }

    private parseDefaults(line: string): Record<string, unknown> {
        const content = this.extractBrackets(line);
        const defaults: Record<string, unknown> = {};
        const entries = this.smartSplit(content, ',');

        for (const entry of entries) {
            if (entry.includes(':')) {
                const [key, value] = entry.split(':', 2);
                defaults[key.trim()] = this.parseValue(value.trim());
            }
        }

        return defaults;
    }

    private parseRecord(line: string, schema: [string, string][], defaults: Record<string, unknown>): Record<string, unknown> | null {
        const values = this.smartSplit(line.trim(), ',');
        const record: Record<string, unknown> = {};

        for (const [fieldName] of schema) {
            if (fieldName in defaults) {
                record[fieldName] = defaults[fieldName];
            }
        }

        let valueIdx = 0;
        for (const [fieldName] of schema) {
            if (valueIdx < values.length) {
                let parsedValue = this.parseValue(values[valueIdx].trim());

                if (typeof parsedValue === 'string' &&
                    parsedValue.startsWith('#') &&
                    parsedValue in this.dictionary) {
                    parsedValue = this.dictionary[parsedValue];
                }

                record[fieldName] = parsedValue;
                valueIdx++;
            }
        }

        return record;
    }

    private parseValue(value: string): unknown {
        if (value === 'null') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;

        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1).replace(/\\"/g, '"');
        }

        if (value.startsWith('#')) {
            return value;
        }

        if (!isNaN(Number(value))) {
            return value.includes('.') ? parseFloat(value) : parseInt(value);
        }

        return value;
    }

    private extractBrackets(line: string): string {
        const start = line.indexOf('[') + 1;
        const end = line.lastIndexOf(']');
        return line.substring(start, end);
    }

    private smartSplit(text: string, delimiter: string): string[] {
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of text) {
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === delimiter && !inQuotes) {
                if (current.trim()) {
                    parts.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            parts.push(current.trim());
        }

        return parts;
    }

    private validateDecoded(data: Record<string, unknown[]>): void {
        if (!data || typeof data !== 'object') {
            throw new ATONDecodingError('Decoded data must be an object');
        }

        for (const [tableName, records] of Object.entries(data)) {
            if (!Array.isArray(records)) {
                throw new ATONDecodingError(`Table '${tableName}' must be an array`);
            }
            for (const record of records) {
                if (!record || typeof record !== 'object') {
                    throw new ATONDecodingError(`Invalid record in '${tableName}'`);
                }
            }
        }
    }
}

// ========================================================================
// EXPORTS
// ========================================================================

export const VERSION = '2.0.2';

export default {
    // Core classes
    Encoder: ATONEncoder,
    Decoder: ATONDecoder,
    StreamEncoder: ATONStreamEncoder,
    QueryEngine: ATONQueryEngine,

    // Enums
    CompressionMode,
    QueryOperator,
    LogicalOperator,
    SortOrder,
    ATONType,

    // Exceptions
    ATONError,
    ATONEncodingError,
    ATONDecodingError,
    ATONQueryError,

    // Version
    version: VERSION
};

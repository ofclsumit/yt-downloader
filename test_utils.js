import assert from 'node:assert';
import { extractYouTubeVideoId, getNativeYouTubeUrl } from './src/utils/youtube.js';
import { parseTimestamp, formatTimestamp, validateTimeRange } from './src/utils/time.js';

console.log('--- Running YouTube Timestamp Clip Utility Tests ---');

// 1. YouTube URL Extraction Tests
console.log('Testing YouTube URL Extraction...');
const standardUrl = extractYouTubeVideoId('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
assert.strictEqual(standardUrl.valid, true);
assert.strictEqual(standardUrl.videoId, 'aqz-KE-bpKQ');

const youtuBeUrl = extractYouTubeVideoId('https://youtu.be/aqz-KE-bpKQ?si=xyz123');
assert.strictEqual(youtuBeUrl.valid, true);
assert.strictEqual(youtuBeUrl.videoId, 'aqz-KE-bpKQ');

const shortsUrl = extractYouTubeVideoId('https://www.youtube.com/shorts/aqz-KE-bpKQ');
assert.strictEqual(shortsUrl.valid, true);
assert.strictEqual(shortsUrl.videoId, 'aqz-KE-bpKQ');

const embedUrl = extractYouTubeVideoId('https://youtube.com/embed/aqz-KE-bpKQ');
assert.strictEqual(embedUrl.valid, true);
assert.strictEqual(embedUrl.videoId, 'aqz-KE-bpKQ');

const paramsUrl = extractYouTubeVideoId('https://www.youtube.com/watch?v=aqz-KE-bpKQ&feature=share&t=25s');
assert.strictEqual(paramsUrl.valid, true);
assert.strictEqual(paramsUrl.videoId, 'aqz-KE-bpKQ');

const invalidDomain = extractYouTubeVideoId('https://vimeo.com/123456789');
assert.strictEqual(invalidDomain.valid, false);

const invalidId = extractYouTubeVideoId('https://www.youtube.com/watch?v=short');
assert.strictEqual(invalidId.valid, false);

const emptyUrl = extractYouTubeVideoId('');
assert.strictEqual(emptyUrl.valid, false);

console.log('✓ URL extraction tests passed.');

// 2. Timestamp Parsing Tests
console.log('Testing Timestamp Parsing...');
assert.deepStrictEqual(parseTimestamp('00:02:10'), { valid: true, seconds: 130, error: null });
assert.deepStrictEqual(parseTimestamp('02:10'), { valid: true, seconds: 130, error: null });
assert.deepStrictEqual(parseTimestamp('130'), { valid: true, seconds: 130, error: null });
assert.deepStrictEqual(parseTimestamp(130), { valid: true, seconds: 130, error: null });
assert.deepStrictEqual(parseTimestamp('01:00:00'), { valid: true, seconds: 3600, error: null });

// Invalid formats
assert.strictEqual(parseTimestamp('-5').valid, false);
assert.strictEqual(parseTimestamp('abc').valid, false);
assert.strictEqual(parseTimestamp('01:75').valid, false); // seconds >= 60

console.log('✓ Timestamp parsing tests passed.');

// 3. Timestamp Formatting Tests
console.log('Testing Timestamp Formatting...');
assert.strictEqual(formatTimestamp(130), '02:10');
assert.strictEqual(formatTimestamp(3665), '01:01:05');
assert.strictEqual(formatTimestamp(0), '00:00');
assert.strictEqual(formatTimestamp(130, true), '00:02:10');

console.log('✓ Timestamp formatting tests passed.');

// 4. Timestamp Range Validation Tests
console.log('Testing Range Validation...');
assert.strictEqual(validateTimeRange(10, 25, 100).valid, true);
assert.strictEqual(validateTimeRange(25, 10, 100).valid, false); // start >= end
assert.strictEqual(validateTimeRange(10, 10, 100).valid, false); // start == end
assert.strictEqual(validateTimeRange(-1, 10, 100).valid, false); // negative start
assert.strictEqual(validateTimeRange(10, 150, 100).valid, false); // end > duration

console.log('✓ Range validation tests passed.');

// 5. Native YouTube URL Generation Tests
console.log('Testing Native YouTube URL Generation...');
assert.strictEqual(
  getNativeYouTubeUrl('aqz-KE-bpKQ', 130),
  'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=130s'
);
assert.strictEqual(
  getNativeYouTubeUrl('aqz-KE-bpKQ', 0),
  'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
);

console.log('✓ Native YouTube URL tests passed.');
console.log('--- All 5 Test Suites Passed Successfully! ---');

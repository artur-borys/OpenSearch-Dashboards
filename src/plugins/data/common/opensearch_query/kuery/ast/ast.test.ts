/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  fromKueryExpression,
  fromLiteralExpression,
  toOpenSearchQuery,
  doesKueryExpressionHaveLuceneSyntaxError,
} from './ast';
import { nodeTypes } from '../node_types';
import { fields } from '../../../index_patterns/mocks';
import { IIndexPattern } from '../../../index_patterns';
import { KueryNode } from '../types';

describe('kuery AST API', () => {
  let indexPattern: IIndexPattern;

  beforeEach(() => {
    indexPattern = ({
      fields,
    } as unknown) as IIndexPattern;
  });

  describe('fromKueryExpression', () => {
    test('should return a match all "is" function for whitespace', () => {
      const expected = nodeTypes.function.buildNode('is', '*', '*');
      const actual = fromKueryExpression('  ');
      expect(actual).toEqual(expected);
    });

    test('should return an "is" function with a null field for single literals', () => {
      const expected = nodeTypes.function.buildNode('is', null, 'foo');
      const actual = fromKueryExpression('foo');
      expect(actual).toEqual(expected);
    });

    test('should ignore extraneous whitespace at the beginning and end of the query', () => {
      const expected = nodeTypes.function.buildNode('is', null, 'foo');
      const actual = fromKueryExpression('  foo ');
      expect(actual).toEqual(expected);
    });

    test('should not split on whitespace', () => {
      const expected = nodeTypes.function.buildNode('is', null, 'foo bar');
      const actual = fromKueryExpression('foo bar');
      expect(actual).toEqual(expected);
    });

    test('should support "and" as a binary operator', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('is', null, 'foo'),
        nodeTypes.function.buildNode('is', null, 'bar'),
      ]);
      const actual = fromKueryExpression('foo and bar');
      expect(actual).toEqual(expected);
    });

    test('should support "or" as a binary operator', () => {
      const expected = nodeTypes.function.buildNode('or', [
        nodeTypes.function.buildNode('is', null, 'foo'),
        nodeTypes.function.buildNode('is', null, 'bar'),
      ]);
      const actual = fromKueryExpression('foo or bar');
      expect(actual).toEqual(expected);
    });

    test('should support negation of queries with a "not" prefix', () => {
      const expected = nodeTypes.function.buildNode(
        'not',
        nodeTypes.function.buildNode('or', [
          nodeTypes.function.buildNode('is', null, 'foo'),
          nodeTypes.function.buildNode('is', null, 'bar'),
        ])
      );
      const actual = fromKueryExpression('not (foo or bar)');
      expect(actual).toEqual(expected);
    });

    test('"and" should have a higher precedence than "or"', () => {
      const expected = nodeTypes.function.buildNode('or', [
        nodeTypes.function.buildNode('is', null, 'foo'),
        nodeTypes.function.buildNode('or', [
          nodeTypes.function.buildNode('and', [
            nodeTypes.function.buildNode('is', null, 'bar'),
            nodeTypes.function.buildNode('is', null, 'baz'),
          ]),
          nodeTypes.function.buildNode('is', null, 'qux'),
        ]),
      ]);
      const actual = fromKueryExpression('foo or bar and baz or qux');
      expect(actual).toEqual(expected);
    });

    test('should support grouping to override default precedence', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('or', [
          nodeTypes.function.buildNode('is', null, 'foo'),
          nodeTypes.function.buildNode('is', null, 'bar'),
        ]),
        nodeTypes.function.buildNode('is', null, 'baz'),
      ]);
      const actual = fromKueryExpression('(foo or bar) and baz');
      expect(actual).toEqual(expected);
    });

    test('should support matching against specific fields', () => {
      const expected = nodeTypes.function.buildNode('is', 'foo', 'bar');
      const actual = fromKueryExpression('foo:bar');
      expect(actual).toEqual(expected);
    });

    test('should also not split on whitespace when matching specific fields', () => {
      const expected = nodeTypes.function.buildNode('is', 'foo', 'bar baz');
      const actual = fromKueryExpression('foo:bar baz');
      expect(actual).toEqual(expected);
    });

    test('should treat quoted values as phrases', () => {
      const expected = nodeTypes.function.buildNode('is', 'foo', 'bar baz', true);
      const actual = fromKueryExpression('foo:"bar baz"');
      expect(actual).toEqual(expected);
    });

    test('should support a shorthand for matching multiple values against a single field', () => {
      const expected = nodeTypes.function.buildNode('or', [
        nodeTypes.function.buildNode('is', 'foo', 'bar'),
        nodeTypes.function.buildNode('is', 'foo', 'baz'),
      ]);
      const actual = fromKueryExpression('foo:(bar or baz)');
      expect(actual).toEqual(expected);
    });

    test('should support "and" and "not" operators and grouping in the shorthand as well', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('or', [
          nodeTypes.function.buildNode('is', 'foo', 'bar'),
          nodeTypes.function.buildNode('is', 'foo', 'baz'),
        ]),
        nodeTypes.function.buildNode('not', nodeTypes.function.buildNode('is', 'foo', 'qux')),
      ]);
      const actual = fromKueryExpression('foo:((bar or baz) and not qux)');
      expect(actual).toEqual(expected);
    });

    test('should support exclusive range operators', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('range', 'bytes', {
          gt: 1000,
        }),
        nodeTypes.function.buildNode('range', 'bytes', {
          lt: 8000,
        }),
      ]);
      const actual = fromKueryExpression('bytes > 1000 and bytes < 8000');
      expect(actual).toEqual(expected);
    });

    test('should support long numerals', () => {
      const lowerBigInt = BigInt(Number.MIN_SAFE_INTEGER) - 11n;
      const upperBigInt = BigInt(Number.MAX_SAFE_INTEGER) + 11n;
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('range', 'bytes', {
          gt: lowerBigInt,
        }),
        nodeTypes.function.buildNode('range', 'bytes', {
          lt: upperBigInt,
        }),
      ]);
      const actual = fromKueryExpression(`bytes > ${lowerBigInt} and bytes < ${upperBigInt}`);
      expect(actual).toEqual(expected);
    });

    test('should support inclusive range operators', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('range', 'bytes', {
          gte: 1000,
        }),
        nodeTypes.function.buildNode('range', 'bytes', {
          lte: 8000,
        }),
      ]);
      const actual = fromKueryExpression('bytes >= 1000 and bytes <= 8000');
      expect(actual).toEqual(expected);
    });

    test('should support wildcards in field names', () => {
      const expected = nodeTypes.function.buildNode('is', 'machine*', 'osx');
      const actual = fromKueryExpression('machine*:osx');
      expect(actual).toEqual(expected);
    });

    test('should support wildcards in values', () => {
      const expected = nodeTypes.function.buildNode('is', 'foo', 'ba*');
      const actual = fromKueryExpression('foo:ba*');
      expect(actual).toEqual(expected);
    });

    test('should create an exists "is" query when a field is given and "*" is the value', () => {
      const expected = nodeTypes.function.buildNode('is', 'foo', '*');
      const actual = fromKueryExpression('foo:*');
      expect(actual).toEqual(expected);
    });

    test('should support nested queries indicated by curly braces', () => {
      const expected = nodeTypes.function.buildNode(
        'nested',
        'nestedField',
        nodeTypes.function.buildNode('is', 'childOfNested', 'foo')
      );
      const actual = fromKueryExpression('nestedField:{ childOfNested: foo }');
      expect(actual).toEqual(expected);
    });

    test('should support nested subqueries and subqueries inside nested queries', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('is', 'response', '200'),
        nodeTypes.function.buildNode(
          'nested',
          'nestedField',
          nodeTypes.function.buildNode('or', [
            nodeTypes.function.buildNode('is', 'childOfNested', 'foo'),
            nodeTypes.function.buildNode('is', 'childOfNested', 'bar'),
          ])
        ),
      ]);
      const actual = fromKueryExpression(
        'response:200 and nestedField:{ childOfNested:foo or childOfNested:bar }'
      );
      expect(actual).toEqual(expected);
    });

    test('should support nested sub-queries inside paren groups', () => {
      const expected = nodeTypes.function.buildNode('and', [
        nodeTypes.function.buildNode('is', 'response', '200'),
        nodeTypes.function.buildNode('or', [
          nodeTypes.function.buildNode(
            'nested',
            'nestedField',
            nodeTypes.function.buildNode('is', 'childOfNested', 'foo')
          ),
          nodeTypes.function.buildNode(
            'nested',
            'nestedField',
            nodeTypes.function.buildNode('is', 'childOfNested', 'bar')
          ),
        ]),
      ]);
      const actual = fromKueryExpression(
        'response:200 and ( nestedField:{ childOfNested:foo } or nestedField:{ childOfNested:bar } )'
      );
      expect(actual).toEqual(expected);
    });

    test('should support nested groups inside other nested groups', () => {
      const expected = nodeTypes.function.buildNode(
        'nested',
        'nestedField',
        nodeTypes.function.buildNode(
          'nested',
          'nestedChild',
          nodeTypes.function.buildNode('is', 'doublyNestedChild', 'foo')
        )
      );
      const actual = fromKueryExpression('nestedField:{ nestedChild:{ doublyNestedChild:foo } }');
      expect(actual).toEqual(expected);
    });
  });

  describe('fromLiteralExpression', () => {
    test('should create literal nodes for unquoted values with correct primitive types', () => {
      const stringLiteral = nodeTypes.literal.buildNode('foo');
      const booleanFalseLiteral = nodeTypes.literal.buildNode(false);
      const booleanTrueLiteral = nodeTypes.literal.buildNode(true);
      const numberLiteral = nodeTypes.literal.buildNode(42);
      const upperBigInt = BigInt(Number.MAX_SAFE_INTEGER) + 11n;

      expect(fromLiteralExpression('foo')).toEqual(stringLiteral);
      expect(fromLiteralExpression('true')).toEqual(booleanTrueLiteral);
      expect(fromLiteralExpression('false')).toEqual(booleanFalseLiteral);
      expect(fromLiteralExpression('42')).toEqual(numberLiteral);

      expect(fromLiteralExpression('.3').value).toEqual(0.3);
      expect(fromLiteralExpression('.36').value).toEqual(0.36);
      expect(fromLiteralExpression('.00001').value).toEqual(0.00001);
      expect(fromLiteralExpression('3').value).toEqual(3);
      expect(fromLiteralExpression('-4').value).toEqual(-4);
      expect(fromLiteralExpression('0').value).toEqual(0);
      expect(fromLiteralExpression('0.0').value).toEqual(0);
      expect(fromLiteralExpression('2.0').value).toEqual(2.0);
      expect(fromLiteralExpression('0.8').value).toEqual(0.8);
      expect(fromLiteralExpression('790.9').value).toEqual(790.9);
      expect(fromLiteralExpression('0.0001').value).toEqual(0.0001);
      expect(fromLiteralExpression('96565646732345').value).toEqual(96565646732345);
      expect(fromLiteralExpression(upperBigInt.toString()).value).toEqual(upperBigInt);

      expect(fromLiteralExpression('..4').value).toEqual('..4');
      expect(fromLiteralExpression('.3text').value).toEqual('.3text');
      expect(fromLiteralExpression('text').value).toEqual('text');
      expect(fromLiteralExpression('.').value).toEqual('.');
      expect(fromLiteralExpression('-').value).toEqual('-');
      expect(fromLiteralExpression('001').value).toEqual('001');
      expect(fromLiteralExpression('00.2').value).toEqual('00.2');
      expect(fromLiteralExpression('0.0.1').value).toEqual('0.0.1');
      expect(fromLiteralExpression('3.').value).toEqual('3.');
      expect(fromLiteralExpression('--4').value).toEqual('--4');
      expect(fromLiteralExpression('-.4').value).toEqual('-.4');
      expect(fromLiteralExpression('-0').value).toEqual('-0');
      expect(fromLiteralExpression('00949').value).toEqual('00949');
      expect(fromLiteralExpression(`00${upperBigInt}`).value).toEqual(`00${upperBigInt}`);
    });

    test('should allow escaping of special characters with a backslash', () => {
      const expected = nodeTypes.literal.buildNode('\\():<>"*');
      // yo dawg
      const actual = fromLiteralExpression('\\\\\\(\\)\\:\\<\\>\\"\\*');
      expect(actual).toEqual(expected);
    });

    test('should support double quoted strings that do not need escapes except for quotes', () => {
      const expected = nodeTypes.literal.buildNode('\\():<>"*');
      const actual = fromLiteralExpression('"\\():<>\\"*"');
      expect(actual).toEqual(expected);
    });

    test('should support escaped backslashes inside quoted strings', () => {
      const expected = nodeTypes.literal.buildNode('\\');
      const actual = fromLiteralExpression('"\\\\"');
      expect(actual).toEqual(expected);
    });

    test('should detect wildcards and build wildcard AST nodes', () => {
      const expected = nodeTypes.wildcard.buildNode('foo*bar');
      const actual = fromLiteralExpression('foo*bar');
      expect(actual).toEqual(expected);
    });
  });

  describe('toOpenSearchQuery', () => {
    test("should return the given node type's OpenSearch query representation", () => {
      const node = nodeTypes.function.buildNode('exists', 'response');
      const expected = nodeTypes.function.toOpenSearchQuery(node, indexPattern);
      const result = toOpenSearchQuery(node, indexPattern);
      expect(result).toEqual(expected);
    });

    test('should return an empty "and" function for undefined nodes and unknown node types', () => {
      const expected = nodeTypes.function.toOpenSearchQuery(
        nodeTypes.function.buildNode('and', []),
        indexPattern
      );

      expect(toOpenSearchQuery((null as unknown) as KueryNode, undefined)).toEqual(expected);

      const noTypeNode = nodeTypes.function.buildNode('exists', 'foo');

      // @ts-expect-error
      delete noTypeNode.type;
      expect(toOpenSearchQuery(noTypeNode)).toEqual(expected);

      const unknownTypeNode = nodeTypes.function.buildNode('exists', 'foo');

      // @ts-expect-error
      unknownTypeNode.type = 'notValid';
      expect(toOpenSearchQuery(unknownTypeNode)).toEqual(expected);
    });

    test("should return the given node type's OpenSearch query representation including a time zone parameter when one is provided", () => {
      const config = { dateFormatTZ: 'America/Phoenix' };
      const node = nodeTypes.function.buildNode('is', '@timestamp', '"2018-04-03T19:04:17"');
      const expected = nodeTypes.function.toOpenSearchQuery(node, indexPattern, config);
      const result = toOpenSearchQuery(node, indexPattern, config);
      expect(result).toEqual(expected);
    });
  });

  describe('doesKueryExpressionHaveLuceneSyntaxError', () => {
    test('should return true for Lucene ranges', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: [1 TO 10]');
      expect(result).toEqual(true);
    });

    test('should return false for DQL ranges', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar < 1');
      expect(result).toEqual(false);
    });

    test('should return true for Lucene exists', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('_exists_: bar');
      expect(result).toEqual(true);
    });

    test('should return false for DQL exists', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar:*');
      expect(result).toEqual(false);
    });

    test('should return true for Lucene wildcards', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: ba?');
      expect(result).toEqual(true);
    });

    test('should return false for DQL wildcards', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: ba*');
      expect(result).toEqual(false);
    });

    test('should return true for Lucene regex', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: /ba.*/');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene fuzziness', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: ba~');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene proximity', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: "ba"~2');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene boosting', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('bar: ba^2');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene + operator', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('+foo: bar');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene - operators', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('-foo: bar');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene && operators', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('foo: bar && baz: qux');
      expect(result).toEqual(true);
    });

    test('should return true for Lucene || operators', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('foo: bar || baz: qux');
      expect(result).toEqual(true);
    });

    test('should return true for mixed DQL/Lucene queries', () => {
      const result = doesKueryExpressionHaveLuceneSyntaxError('foo: bar and (baz: qux || bag)');
      expect(result).toEqual(true);
    });
  });
});

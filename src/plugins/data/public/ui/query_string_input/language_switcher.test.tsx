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

import React from 'react';
import { QueryLanguageSwitcher } from './language_switcher';
import { OpenSearchDashboardsContextProvider } from 'src/plugins/opensearch_dashboards_react/public';
import { coreMock } from '../../../../../core/public/mocks';
import { mountWithIntl } from 'test_utils/enzyme_helpers';
import { EuiComboBox } from '@elastic/eui';
import { QueryEnhancement } from '../types';

const startMock = coreMock.createStart();

jest.mock('../../services', () => ({
  getUiService: () => ({
    isEnhancementsEnabled: true,
    queryEnhancements: new Map<string, QueryEnhancement>(),
    Settings: {
      setUiOverridesByUserQueryLanguage: jest.fn(),
    },
  }),
  getSearchService: () => ({
    __enhance: jest.fn(),
    df: {
      clear: jest.fn(),
    },
    getDefaultSearchInterceptor: jest.fn(),
  }),
}));

describe('LanguageSwitcher', () => {
  function wrapInContext(testProps: any) {
    const services = {
      uiSettings: startMock.uiSettings,
      docLinks: startMock.docLinks,
    };

    return (
      <OpenSearchDashboardsContextProvider services={services}>
        <QueryLanguageSwitcher {...testProps} />
      </OpenSearchDashboardsContextProvider>
    );
  }

  it('should select lucene if language is lucene', () => {
    const component = mountWithIntl(
      wrapInContext({
        language: 'lucene',
        onSelectLanguage: () => {
          return;
        },
      })
    );
    const euiComboBox = component.find(EuiComboBox);
    expect(euiComboBox.prop('selectedOptions')).toEqual(
      expect.arrayContaining([
        {
          label: 'Lucene',
        },
      ])
    );
  });

  it('should select DQL if language is kuery', () => {
    const component = mountWithIntl(
      wrapInContext({
        language: 'kuery',
        onSelectLanguage: () => {
          return;
        },
      })
    );
    const euiComboBox = component.find(EuiComboBox);
    expect(euiComboBox.prop('selectedOptions')).toEqual(
      expect.arrayContaining([
        {
          label: 'DQL',
        },
      ])
    );
  });
});

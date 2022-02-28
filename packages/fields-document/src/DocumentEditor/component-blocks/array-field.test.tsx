/** @jest-environment jsdom */
/** @jsxRuntime classic */
/** @jsx jsx */
import React from 'react';
import { jsx, makeEditor } from '../tests/utils';
import { component, fields } from '../../component-blocks';
import { createPreviewProps } from './preview-props';
import { ExtractPropFromComponentPropFieldForPreview } from './api';

const table = component({
  component: props =>
    React.createElement(
      'div',
      null,
      props.children.elements.map(x => {
        return x.element.elements.map(x => {
          return x.element.content;
        });
      })
    ),
  label: '',
  props: {
    children: fields.array(
      fields.array(
        fields.object({
          content: fields.child({ kind: 'inline', placeholder: '' }),
          something: fields.text({ label: '' }),
        })
      )
    ),
  },
});

test('child field in nested array', () => {
  const editor = makeEditor(
    <editor>
      <component-block
        component="table"
        props={{
          children: [[{ content: null, something: '1' }]],
        }}
      >
        <component-inline-prop propPath={['children', 0, 0, 'content']}>
          <text>first</text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text />
      </paragraph>
    </editor>,
    {
      componentBlocks: {
        table,
      },
    }
  );
  expect(editor).toMatchInlineSnapshot(`
    <editor>
      <component-block
        component="table"
        props={
          Object {
            "children": Array [
              Array [
                Object {
                  "content": null,
                  "something": "1",
                },
              ],
            ],
          }
        }
      >
        <component-inline-prop
          propPath={
            Array [
              "children",
              0,
              0,
              "content",
            ]
          }
        >
          <text>
            first
          </text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text>
          
        </text>
      </paragraph>
    </editor>
  `);
});

test('multiple in child field in nested array', () => {
  const editor = makeEditor(
    <editor>
      <component-block
        component="table"
        props={{
          children: [
            [
              { content: null, something: '1' },
              { content: null, something: '2' },
            ],
            [
              { content: null, something: '3' },
              { content: null, something: '4' },
            ],
          ],
        }}
      >
        <component-inline-prop propPath={['children', 0, 0, 'content']}>
          <text>first</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 0, 1, 'content']}>
          <text>second</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 1, 0, 'content']}>
          <text>third</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 1, 1, 'content']}>
          <text>fourth</text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text />
      </paragraph>
    </editor>,
    {
      componentBlocks: {
        table,
      },
    }
  );
  expect(editor).toMatchInlineSnapshot(`
    <editor>
      <component-block
        component="table"
        props={
          Object {
            "children": Array [
              Array [
                Object {
                  "content": null,
                  "something": "1",
                },
                Object {
                  "content": null,
                  "something": "2",
                },
              ],
              Array [
                Object {
                  "content": null,
                  "something": "3",
                },
                Object {
                  "content": null,
                  "something": "4",
                },
              ],
            ],
          }
        }
      >
        <component-inline-prop
          propPath={
            Array [
              "children",
              0,
              0,
              "content",
            ]
          }
        >
          <text>
            first
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              0,
              1,
              "content",
            ]
          }
        >
          <text>
            second
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              1,
              0,
              "content",
            ]
          }
        >
          <text>
            third
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              1,
              1,
              "content",
            ]
          }
        >
          <text>
            fourth
          </text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text>
          
        </text>
      </paragraph>
    </editor>
  `);
});

test('add to multiple in child field in nested array', () => {
  const editor = makeEditor(
    <editor>
      <component-block
        component="table"
        props={{
          children: [
            [
              { content: null, something: '1' },
              { content: null, something: '2' },
            ],
            [
              { content: null, something: '3' },
              { content: null, something: '4' },
            ],
          ],
        }}
      >
        <component-inline-prop propPath={['children', 0, 0, 'content']}>
          <text>first</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 0, 1, 'content']}>
          <text>second</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 1, 0, 'content']}>
          <text>third</text>
        </component-inline-prop>
        <component-inline-prop propPath={['children', 1, 1, 'content']}>
          <text>fourth</text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text />
      </paragraph>
    </editor>,
    {
      componentBlocks: {
        table,
      },
    }
  );
  const previewProps: ExtractPropFromComponentPropFieldForPreview<{
    kind: 'object';
    value: typeof table['props'];
  }> = createPreviewProps(
    editor.children[0] as any,
    table,
    {},
    () => {},
    editor,
    editor.children[0] as any
  ) as any;
  previewProps.children.elements[0].element.insert();
  expect(editor).toMatchInlineSnapshot(`
    <editor>
      <component-block
        component="table"
        props={
          Object {
            "children": Array [
              Array [
                Object {
                  "content": null,
                  "something": "1",
                },
                Object {
                  "content": null,
                  "something": "2",
                },
              ],
              Array [
                Object {
                  "content": null,
                  "something": "3",
                },
                Object {
                  "content": null,
                  "something": "4",
                },
              ],
            ],
          }
        }
      >
        <component-inline-prop
          propPath={
            Array [
              "children",
              0,
              0,
              "content",
            ]
          }
        >
          <text>
            first
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              0,
              1,
              "content",
            ]
          }
        >
          <text>
            second
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              1,
              0,
              "content",
            ]
          }
        >
          <text>
            third
          </text>
        </component-inline-prop>
        <component-inline-prop
          propPath={
            Array [
              "children",
              1,
              1,
              "content",
            ]
          }
        >
          <text>
            fourth
          </text>
        </component-inline-prop>
      </component-block>
      <paragraph>
        <text>
          
        </text>
      </paragraph>
    </editor>
  `);
});

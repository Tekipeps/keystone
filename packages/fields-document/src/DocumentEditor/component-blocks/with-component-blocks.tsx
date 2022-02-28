import { Editor, Element, Transforms, Range, NodeEntry, Path, Node, Text } from 'slate';

import weakMemoize from '@emotion/weak-memoize';
import { ChildField, ComponentBlock, ComponentPropField } from '../../component-blocks';
import { assert, moveChildren } from '../utils';
import { DocumentFeatures } from '../../views';
import {
  areArraysEqual,
  normalizeElementBasedOnDocumentFeatures,
  normalizeInlineBasedOnLinksAndRelationships,
  normalizeTextBasedOnInlineMarksAndSoftBreaks,
} from '../document-features-normalization';
import { Relationships } from '../relationship';
import {
  assertNever,
  DocumentFeaturesForChildField,
  findChildPropPaths,
  getAncestorFields,
  getDocumentFeaturesForChildField,
  getValueAtPropPath,
  PropPath,
  transformProps,
} from './utils';
import { getInitialPropsValue } from './initial-values';
import { ArrayField } from './api';

function getAncestorComponentBlock(editor: Editor) {
  if (editor.selection) {
    const ancestorEntry = Editor.above(editor, {
      match: node => Editor.isBlock(editor, node) && node.type !== 'paragraph',
    });
    if (
      ancestorEntry &&
      (ancestorEntry[0].type === 'component-block-prop' ||
        ancestorEntry[0].type === 'component-inline-prop')
    ) {
      return {
        isInside: true,
        componentBlock: Editor.parent(editor, ancestorEntry[1]) as NodeEntry<
          Element & { type: 'component-block' }
        >,
        prop: ancestorEntry as NodeEntry<
          Element & { type: 'component-inline-prop' | 'component-block-prop' }
        >,
      } as const;
    }
  }
  return { isInside: false } as const;
}

const alreadyNormalizedThings: WeakMap<
  DocumentFeaturesForChildField,
  WeakSet<Node>
> = new WeakMap();

function normalizeNodeWithinComponentProp(
  [node, path]: NodeEntry,
  editor: Editor,
  fieldOptions: DocumentFeaturesForChildField,
  relationships: Relationships
): boolean {
  let alreadyNormalizedNodes = alreadyNormalizedThings.get(fieldOptions);
  if (!alreadyNormalizedNodes) {
    alreadyNormalizedNodes = new WeakSet();
    alreadyNormalizedThings.set(fieldOptions, alreadyNormalizedNodes);
  }
  if (alreadyNormalizedNodes.has(node)) {
    return false;
  }
  let didNormalization = false;
  if (fieldOptions.inlineMarks !== 'inherit' && Text.isText(node)) {
    didNormalization = normalizeTextBasedOnInlineMarksAndSoftBreaks(
      [node, path],
      editor,
      fieldOptions.inlineMarks,
      fieldOptions.softBreaks
    );
  }
  if (Element.isElement(node)) {
    let childrenHasChanged = node.children
      .map((node, i) =>
        normalizeNodeWithinComponentProp([node, [...path, i]], editor, fieldOptions, relationships)
      )
      // .map then .some because we don't want to exit early
      .some(x => x);
    if (fieldOptions.kind === 'block') {
      didNormalization =
        normalizeElementBasedOnDocumentFeatures(
          [node, path],
          editor,
          fieldOptions.documentFeatures,
          relationships
        ) || childrenHasChanged;
    } else {
      didNormalization = normalizeInlineBasedOnLinksAndRelationships(
        [node, path],
        editor,
        fieldOptions.documentFeatures.links,
        fieldOptions.documentFeatures.relationships,
        relationships
      );
    }
  }

  if (didNormalization === false) {
    alreadyNormalizedNodes.add(node);
  }
  return didNormalization;
}

function doesPropOnlyEverContainASingleChildField(rootProp: ComponentPropField): boolean {
  const queue = new Set<ComponentPropField>([rootProp]);
  let hasFoundChildField = false;
  for (const prop of queue) {
    if (prop.kind === 'form' || prop.kind === 'relationship') {
    } else if (prop.kind === 'child') {
      if (hasFoundChildField) {
        return false;
      }
      hasFoundChildField = true;
    } else if (prop.kind === 'array') {
      if (doesPropOnlyEverContainASingleChildField(prop.element)) {
        return false;
      }
      queue.add(prop.element);
    } else if (prop.kind === 'object') {
      for (const innerProp of Object.values(prop.value)) {
        queue.add(innerProp);
      }
    } else if (prop.kind === 'conditional') {
      for (const innerProp of Object.values(prop.values)) {
        queue.add(innerProp);
      }
    } else {
      assertNever(prop);
    }
  }
  return hasFoundChildField;
}

function findArrayFieldsWithSingleChildField(prop: ComponentPropField, value: unknown) {
  const propPaths: [PropPath, ArrayField<ComponentPropField>][] = [];
  transformProps(prop, value, (prop, value, path) => {
    if (prop.kind === 'array') {
      if (doesPropOnlyEverContainASingleChildField(prop.element)) {
        propPaths.push([path, prop]);
      }
    }
    return value;
  });
  return propPaths;
}

function isEmptyChildFieldNode(
  element: Element & ({ type: 'component-block-prop' } | { type: 'component-inline-prop' })
) {
  const firstChild = element.children[0];
  return (
    element.children.length === 1 &&
    ((element.type === 'component-inline-prop' &&
      firstChild.type === undefined &&
      firstChild.text === '') ||
      (element.type === 'component-block-prop' &&
        firstChild.type === 'paragraph' &&
        firstChild.children.length === 1 &&
        firstChild.children[0].type === undefined &&
        firstChild.children[0].text === ''))
  );
}

export function withComponentBlocks(
  blockComponents: Record<string, ComponentBlock | undefined>,
  editorDocumentFeatures: DocumentFeatures,
  relationships: Relationships,
  editor: Editor
): Editor {
  // note that conflicts between the editor document features
  // and the child field document features are dealt with elsewhere
  const memoizedGetDocumentFeaturesForChildField = weakMemoize(
    (options: ChildField['options']): DocumentFeaturesForChildField => {
      return getDocumentFeaturesForChildField(editorDocumentFeatures, options);
    }
  );
  const { normalizeNode, deleteBackward, insertBreak } = editor;
  editor.deleteBackward = unit => {
    if (editor.selection) {
      const ancestorComponentBlock = getAncestorComponentBlock(editor);
      if (
        ancestorComponentBlock.isInside &&
        Range.isCollapsed(editor.selection) &&
        Editor.isStart(editor, editor.selection.anchor, ancestorComponentBlock.prop[1]) &&
        ancestorComponentBlock.prop[1][ancestorComponentBlock.prop[1].length - 1] === 0
      ) {
        Transforms.unwrapNodes(editor, { at: ancestorComponentBlock.componentBlock[1] });
        return;
      }
    }
    deleteBackward(unit);
  };
  editor.insertBreak = () => {
    const ancestorComponentBlock = getAncestorComponentBlock(editor);
    if (editor.selection && ancestorComponentBlock.isInside) {
      const {
        prop: [componentPropNode, componentPropPath],
        componentBlock: [componentBlockNode, componentBlockPath],
      } = ancestorComponentBlock;
      const isLastProp =
        componentPropPath[componentPropPath.length - 1] === componentBlockNode.children.length - 1;

      if (componentPropNode.type === 'component-block-prop') {
        const [[paragraphNode, paragraphPath]] = Editor.nodes(editor, {
          match: node => node.type === 'paragraph',
        });
        const isLastParagraph =
          paragraphPath[paragraphPath.length - 1] === componentPropNode.children.length - 1;
        if (Node.string(paragraphNode) === '' && isLastParagraph) {
          if (isLastProp) {
            Transforms.moveNodes(editor, {
              at: paragraphPath,
              to: Path.next(ancestorComponentBlock.componentBlock[1]),
            });
          } else {
            Transforms.move(editor, { distance: 1, unit: 'line' });
            Transforms.removeNodes(editor, { at: paragraphPath });
          }
          return;
        }
      }
      if (componentPropNode.type === 'component-inline-prop') {
        Editor.withoutNormalizing(editor, () => {
          const componentBlock = blockComponents[componentBlockNode.component];
          if (componentPropNode.propPath !== undefined && componentBlock !== undefined) {
            const rootProp = { kind: 'object' as const, value: componentBlock.props };
            const ancestorFields = getAncestorFields(
              rootProp,
              componentPropNode.propPath,
              componentBlockNode.props
            );
            const idx = [...ancestorFields].reverse().findIndex(item => item.kind === 'array');
            if (idx !== -1) {
              const arrayFieldIdx = ancestorFields.length - 1 - idx;
              const arrayField = ancestorFields[arrayFieldIdx];
              const val = getValueAtPropPath(
                componentBlockNode.props,
                componentPropNode.propPath.slice(0, arrayFieldIdx)
              ) as unknown[];
              if (doesPropOnlyEverContainASingleChildField(arrayField)) {
                if (
                  Node.string(componentPropNode) === '' &&
                  val.length - 1 === componentPropNode.propPath[arrayFieldIdx]
                ) {
                  Transforms.removeNodes(editor, { at: componentPropPath });
                  if (isLastProp) {
                    Transforms.insertNodes(
                      editor,
                      { type: 'paragraph', children: [{ text: '' }] },
                      { at: Path.next(componentBlockPath) }
                    );
                    Transforms.select(editor, Path.next(componentBlockPath));
                  } else {
                    Transforms.move(editor, { distance: 1, unit: 'line' });
                  }
                } else {
                  insertBreak();
                }
                return;
              }
            }
          }

          Transforms.splitNodes(editor, { always: true });
          const splitNodePath = Path.next(componentPropPath);

          if (isLastProp) {
            Transforms.moveNodes(editor, {
              at: splitNodePath,
              to: Path.next(componentBlockPath),
            });
          } else {
            moveChildren(editor, splitNodePath, [...Path.next(splitNodePath), 0]);
            Transforms.removeNodes(editor, { at: splitNodePath });
          }
        });
        return;
      }
    }
    insertBreak();
  };

  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Element.isElement(node) || Editor.isEditor(node)) {
      if (
        node.type === 'component-inline-prop' &&
        !node.propPath &&
        (node.children.length !== 1 ||
          !Text.isText(node.children[0]) ||
          node.children[0].text !== '')
      ) {
        Transforms.removeNodes(editor, {
          at: path,
        });
        return;
      }

      if (Element.isElement(node) && node.type === 'component-block') {
        const componentBlock = blockComponents[node.component];
        if (componentBlock) {
          const rootProp = { kind: 'object' as const, value: componentBlock.props };
          for (const [propPath, arrayField] of findArrayFieldsWithSingleChildField(
            rootProp,
            node.props
          )) {
            if (
              node.children.length === 1 &&
              node.children[0].type === 'component-inline-prop' &&
              node.children[0].propPath === undefined
            ) {
              break;
            }
            const nodesWithin: [
              number,
              Element & { type: 'component-block-prop' | 'component-inline-prop' }
            ][] = [];
            for (const [idx, childNode] of node.children.entries()) {
              if (
                (childNode.type === 'component-block-prop' ||
                  childNode.type === 'component-inline-prop') &&
                childNode.propPath !== undefined
              ) {
                const indexForLastArrayIndex = findLastIndex(
                  childNode.propPath,
                  x => typeof x === 'number'
                );
                if (areArraysEqual(propPath, childNode.propPath.slice(0, indexForLastArrayIndex))) {
                  nodesWithin.push([idx, childNode]);
                }
              }
            }
            const arrVal = getValueAtPropPath(node.props, propPath) as unknown[];
            // delete backwards
            const alreadyUsedIndicies = new Set<number>();
            // all of the fields are unique so we've removed/re-ordered/done nothing
            const newVal: unknown[] = [];
            for (const [, node] of nodesWithin) {
              const idxFromValue = node.propPath![propPath.length];
              assert(typeof idxFromValue === 'number');
              if (
                arrVal.length <= idxFromValue ||
                (alreadyUsedIndicies.has(idxFromValue) && isEmptyChildFieldNode(node))
              ) {
                newVal.push(getInitialPropsValue(arrayField.element));
              } else {
                alreadyUsedIndicies.add(idxFromValue);
                newVal.push(arrVal[idxFromValue]);
              }
            }
            // console.log({ arrVal, newVal });
            if (!areArraysEqual(arrVal, newVal)) {
              const transformedProps = transformProps(rootProp, node.props, (prop, value, path) => {
                if (prop.kind === 'array' && areArraysEqual(path, propPath)) {
                  return newVal;
                }
                return value;
              });
              Transforms.setNodes(
                editor,
                { props: transformedProps as Record<string, unknown> },
                { at: path }
              );
              for (const [idx, [idxInChildrenOfBlock, nodeWithin]] of nodesWithin.entries()) {
                const newPropPath = [...nodeWithin.propPath!];
                newPropPath[propPath.length] = idx;
                Transforms.setNodes(
                  editor,
                  { propPath: newPropPath },
                  { at: [...path, idxInChildrenOfBlock] }
                );
              }
              return;
            }
          }
          let missingKeys = new Map(
            findChildPropPaths(node.props, componentBlock.props).map(x => [
              JSON.stringify(x.path) as string | undefined,
              x.options.kind,
            ])
          );

          node.children.forEach(node => {
            assert(node.type === 'component-block-prop' || node.type === 'component-inline-prop');
            missingKeys.delete(JSON.stringify(node.propPath));
          });
          if (missingKeys.size) {
            Transforms.insertNodes(
              editor,
              [...missingKeys].map(([prop, kind]) => ({
                type: `component-${kind}-prop` as const,
                propPath: prop ? JSON.parse(prop) : prop,
                children: [{ text: '' }],
              })),
              { at: [...path, node.children.length] }
            );
            return;
          }

          let foundProps = new Set<string>();

          let stringifiedInlinePropPaths: Record<
            string,
            { options: ChildField['options']; index: number } | undefined
          > = {};
          findChildPropPaths(node.props, blockComponents[node.component]!.props).forEach(
            (x, index) => {
              stringifiedInlinePropPaths[JSON.stringify(x.path)] = { options: x.options, index };
            }
          );

          for (const [index, childNode] of node.children.entries()) {
            if (
              // children that are not these will be handled by
              // the generic allowedChildren normalization
              childNode.type === 'component-inline-prop' ||
              childNode.type === 'component-block-prop'
            ) {
              const childPath = [...path, index];
              const stringifiedPropPath = JSON.stringify(childNode.propPath);
              if (stringifiedInlinePropPaths[stringifiedPropPath] === undefined) {
                Transforms.removeNodes(editor, { at: childPath });
                return;
              } else {
                if (foundProps.has(stringifiedPropPath)) {
                  Transforms.removeNodes(editor, { at: childPath });
                  return;
                }
                foundProps.add(stringifiedPropPath);
                const propInfo = stringifiedInlinePropPaths[stringifiedPropPath]!;
                const expectedIndex = propInfo.index;
                if (index !== expectedIndex) {
                  Transforms.moveNodes(editor, { at: childPath, to: [...path, expectedIndex] });
                  return;
                }
                const expectedChildNodeType = `component-${propInfo.options.kind}-prop` as const;
                if (childNode.type !== expectedChildNodeType) {
                  Transforms.setNodes(editor, { type: expectedChildNodeType }, { at: childPath });
                  return;
                }
                const documentFeatures = memoizedGetDocumentFeaturesForChildField(propInfo.options);
                if (
                  normalizeNodeWithinComponentProp(
                    [childNode, childPath],
                    editor,
                    documentFeatures,
                    relationships
                  )
                ) {
                  return;
                }
              }
            }
          }
        }
      }
    }

    normalizeNode(entry);
  };

  return editor;
}

function findLastIndex<T>(array: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = array.length - 1; i >= 0; --i) {
    if (predicate(array[i])) {
      return i;
    }
  }
  return -1;
}

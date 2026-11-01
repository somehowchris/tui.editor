import { DOMParser, Fragment, Slice, Node } from 'prosemirror-model';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';
import { createHTMLSchemaMap } from '@/wysiwyg/nodes/html';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { getTableContentFromSlice } from '@/wysiwyg/helper/table';
import { changePastedHTML, changePastedSlice } from '@/wysiwyg/clipboard/paste';
import { createHTMLrenderer } from '../../markdown/util';

describe('malformed table clipboard slices', () => {
  let editor: WysiwygEditor;

  beforeEach(() => {
    const renderer = createHTMLrenderer();
    const toDOMAdaptor = new WwToDOMAdaptor({}, renderer);
    const htmlSchemaMap = createHTMLSchemaMap(renderer, sanitizeHTML, toDOMAdaptor);

    editor = new WysiwygEditor(new EventEmitter(), { toDOMAdaptor, htmlSchemaMap });
    document.body.appendChild(editor.el);
  });

  afterEach(() => {
    const { el } = editor;

    editor.destroy();
    el.remove();
  });

  it('rejects an empty slice without dereferencing a missing child', () => {
    expect(getTableContentFromSlice(Slice.empty)).toBeNull();
  });

  it.each(['table', 'head', 'body', 'row'])(
    'ignores an empty %s while retaining adjacent text',
    (kind) => {
      const { schema } = editor;
      const { table, tableHead, tableBody, tableRow, paragraph } = schema.nodes;
      const children: Record<string, Node | null> = {
        table: null,
        head: tableHead.create(),
        body: tableBody.create(),
        row: tableBody.create(null, tableRow.create()),
      };
      const empty = table.create(null, children[kind]);
      const tableSlice = new Slice(Fragment.from(empty), 0, 0);
      const paragraphNode = paragraph.create(null, schema.text('retained'));

      expect(getTableContentFromSlice(tableSlice)).toBeNull();
      [false, true].forEach((isInTable) => {
        const slice = new Slice(Fragment.from([paragraphNode, empty, paragraphNode]), 0, 0);
        const result = changePastedSlice(slice, schema, isInTable);

        expect(result.content.childCount).toBe(2);
        expect(result.content.textBetween(0, result.content.size)).toBe('retainedretained');
      });
    }
  );

  it('retains a valid table and its cell text', () => {
    const { schema } = editor;
    const {
      table,
      tableHead,
      tableBody,
      tableRow,
      tableHeadCell,
      tableBodyCell,
      paragraph,
    } = schema.nodes;
    const headCell = tableHeadCell.create(null, paragraph.create(null, schema.text('heading')));
    const bodyCell = tableBodyCell.create(null, paragraph.create(null, schema.text('value')));
    const node = table.create(null, [
      tableHead.create(null, tableRow.create(null, headCell)),
      tableBody.create(null, tableRow.create(null, bodyCell)),
    ]);
    const slice = new Slice(Fragment.from(node), 0, 0);
    const result = changePastedSlice(slice, schema, false);

    expect(getTableContentFromSlice(slice)).not.toBeNull();
    expect(result.content.firstChild!.type.name).toBe('table');
    expect(result.content.textBetween(0, result.content.size)).toBe('headingvalue');
    expect(() => result.content.firstChild!.check()).not.toThrow();
  });

  it('does not crash after sanitizing malformed math/table clipboard markup', () => {
    const wrapper = document.createElement('div');
    const html = '<math><mtext><table><mglyph><style><img src onerror=alert(1)>';

    wrapper.innerHTML = sanitizeHTML(changePastedHTML(html));
    const slice = DOMParser.fromSchema(editor.schema).parseSlice(wrapper);

    [false, true].forEach((isInTable) => {
      const transformed = changePastedSlice(slice, editor.schema, isInTable);
      const pasted = editor.view.state.apply(editor.view.state.tr.replaceSelection(transformed));
      const typed = pasted.apply(pasted.tr.insertText('Still usable'));

      expect(() => typed.doc.check()).not.toThrow();
      expect(typed.doc.textContent).toContain('Still usable');
    });
    expect(wrapper.querySelector('[onerror],script')).toBeNull();
  });

  it.each(['both', 'start', 'end'])(
    'clamps open depths after removing malformed %s boundaries before selection replacement',
    (boundary) => {
      const { schema } = editor;
      const empty = schema.nodes.table.create();
      const text = schema.nodes.paragraph.create(null, schema.text('retained'));
      const fragments: Record<string, Node[]> = {
        both: [empty],
        start: [empty, text],
        end: [text, empty],
      };
      const original = Slice.maxOpen(Fragment.from(fragments[boundary]));
      const transformed = changePastedSlice(original, schema, false);
      const pasted = editor.view.state.apply(editor.view.state.tr.replaceSelection(transformed));

      expect(() => pasted.doc.check()).not.toThrow();
      expect(pasted.doc.textContent).toBe(boundary === 'both' ? '' : 'retained');
      if (boundary === 'both') {
        expect(transformed.openStart).toBe(0);
        expect(transformed.openEnd).toBe(0);
      }
    }
  );

  it.each([
    ['empty body', '<thead><tr><th>retained</th></tr></thead><tbody></tbody>'],
    ['empty head', '<thead></thead><tbody><tr><td>retained</td></tr></tbody>'],
    ['empty row', '<tbody><tr></tr><tr><td>retained</td></tr></tbody>'],
  ])('parses HTML with an %s and retains usable neighboring cells', (_, html) => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = sanitizeHTML(changePastedHTML(`<table>${html}</table>`));
    const parsed = DOMParser.fromSchema(editor.schema).parseSlice(wrapper);
    const transformed = changePastedSlice(parsed, editor.schema, false);
    const pasted = editor.view.state.apply(editor.view.state.tr.replaceSelection(transformed));
    const typed = pasted.apply(pasted.tr.insertText('Still usable'));

    expect(() => typed.doc.check()).not.toThrow();
    expect(typed.doc.textContent).toContain('retained');
    expect(typed.doc.textContent).toContain('Still usable');
  });

  it.each(['emptyHead', 'emptyBody', 'emptyRow', 'invalidCell'])(
    'retains valid neighboring cells beside %s and produces a valid table',
    (kind) => {
      const { schema } = editor;
      const {
        table,
        tableHead,
        tableBody,
        tableRow,
        tableHeadCell,
        tableBodyCell,
        paragraph,
      } = schema.nodes;
      const head = tableHead.create(
        null,
        tableRow.create(
          null,
          tableHeadCell.create(null, paragraph.create(null, schema.text('heading')))
        )
      );
      const bodyRow = tableRow.create(
        null,
        tableBodyCell.create(null, paragraph.create(null, schema.text('value')))
      );
      const body = tableBody.create(null, bodyRow);
      const cases: Record<string, Node[]> = {
        emptyHead: [tableHead.create(), body],
        emptyBody: [head, tableBody.create()],
        emptyRow: [head, tableBody.create(null, [tableRow.create(), bodyRow])],
        invalidCell: [
          head,
          tableBody.create(null, [tableRow.create(null, paragraph.create()), bodyRow]),
        ],
      };
      const slice = new Slice(Fragment.from(table.create(null, cases[kind])), 0, 0);
      const result = changePastedSlice(slice, schema, false);
      const text = result.content.textBetween(0, result.content.size);

      expect(result.content.childCount).toBe(1);
      const expected: Record<string, string> = {
        emptyHead: 'value',
        emptyBody: 'heading',
        emptyRow: 'headingvalue',
        invalidCell: 'headingvalue',
      };

      expect(text).toBe(expected[kind]);
      expect(() => result.content.firstChild!.check()).not.toThrow();
    }
  );
});

import { Generation, normalizeToken } from './catalog.mjs';
import { checkCredential } from './credential.mjs';

export default {
  emits: ['validationChanged'],
  props: {
    value: { type: Object, required: true },
    mode: { type: String, default: 'edit' },
    driverName: { type: String, default: 'clo' },
  },
  data() {
    return { draftToken: '', checking: false, errorCode: '', generation: new Generation() };
  },
  computed: {
    ready() {
      try {
        return this.mode === 'view' || !this.checking && !!(normalizeToken(this.draftToken) || this.value.id);
      } catch {
        return false;
      }
    },
  },
  watch: {
    ready: {
      immediate: true,
      handler(value) { this.$emit('validationChanged', value); },
    },
    draftToken() {
      this.generation.invalidate();
      this.errorCode = '';
      this.checking = false;
    },
    'value.id'() { this.generation.invalidate(); },
  },
  beforeUnmount() { this.generation.invalidate(); },
  methods: {
    async test() {
      if (this.mode === 'view') {
        return true;
      }
      if (this.checking) {
        return false;
      }
      const ticket = this.generation.next();
      const isCurrent = () => this.generation.isCurrent(ticket);

      this.checking = true;
      this.errorCode = '';
      try {
        return await checkCredential({
          token: this.draftToken,
          credentialId: this.value.id,
          proxy: this.$shell.proxy,
          isCurrent,
          commit: (token) => this.value.setData('apiToken', token),
          onError: (code) => { this.errorCode = code; },
        });
      } finally {
        if (isCurrent()) {
          this.checking = false;
        }
      }
    },
  },
};

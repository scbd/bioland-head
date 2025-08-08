<template>
    <div class="w-100 ps-3" >

        <div class="reply-text ms-1 mb-0 d-flex align-items-center">
            <span class="ps-2 me-1 small text-muted text-capitalize">{{reply.dateString}}</span> 

            <button :disabled="disabled" @click.prevent.stop="focusOnCommentField" type="button" class="btn btn-outline-dark nb mx-1  text-capitalize btn-sm "><span class="text-small" style="font-weight: bold; letter-spacing: 0.075em;">{{ t('reply') }}</span></button>
        </div>
        <div v-if="count && !repliesVisible" class="ms-1 mt-1 mb-0">
            <button  @click="showReplies" type="button" class="btn btn-outline-dark nb  fs-5 font-weight-bold btn-sm"><span style="font-weight: bold; letter-spacing: 0.05em; "><span class="text-capitalize">{{ t('view') }}</span> <span v-if="count">{{ t('all') }}</span> <span>{{ count }}</span> <span>{{ t('reply', count) }}</span> </span></button>
        </div>
        <LazySpinner v-if="loading" :size="60"/>
        <div  @click="openLogin" v-show="showInput" class="comment position-relative ps-1" v-click-outside="blurEditor">
            <input  class="form-control" type="hidden" placeholder="Write a public comment" aria-label="Amount (to the nearest dollar)">
            
            <div :class="{'input-group': !isFocused, 'input-group-focus': isFocused}" class="input-group input-group-lg    mb-3">
                <div id="comment-editor" :ref="(el) => replyEditor = el" @focus="focusEditor" class="form-control px-3" contenteditable> </div>
                <div class="input-group-text" >
                    <div class="d-flex justify-content-between align-items-center w-100">
                        <div >
                            <button @click="showEmojiSelector" :class="{'emoji-btn-active':showEmojiPicker}" type="button" class="btn btn-outline-dark nb me-1 ">
                                <LazyIcon name="happy-face" :size="1.25" /> 
                            </button>
                        </div>
                        <button @click="sendComment" type="button" class="btn btn-outline-dark nb ">
                            <LazyIcon name="send" :size="1.25" />
                        </button>
                    </div>
                </div>
            </div> 
            <div v-click-outside="hideEmojiSelector" class="emoji-container z-1 ps-1" v-if="showEmojiPicker" >
                <LazyNuxtEmojiPicker  :hide-search="false" theme="dark" @select="onSelectEmoji" />
            </div>
        </div>

        <div v-if="count && (repliesVisible )" class="my-1">
            
            <div  v-for="(reply,index) in replies" :key="index">
                <LazyPageCommentReply :reply="reply" />
            </div>
        </div>
    </div>
</template>
<script setup>
    import   textCursorHelper   from 'text-cusor-helper'            ;
    import   ModalLogin         from '~/components/modal/login.vue' ;
    import { useModal         } from 'vue-final-modal'              ;
    import   clone              from 'lodash.clonedeep'             ;

    const   route              = useRoute     (     );
    const   alertStore         = useAlertStore(     );
    const   meStore            = useMeStore   (     );
    const   siteStore          = useSiteStore (     );
    const   eventBus           = useEventBus  (     );
    const { t              , } = useI18n      (     );
    const   replyEditor        = shallowRef   (     );
    const   isFocused          = ref          (false);
    const   showEmojiPicker    = ref          (false);


    const   props    = defineProps({ reply: { type: Object }, disabled: { type: Boolean, default: false }, topRepliesVisible: { type: Boolean, default: false } });
    const { reply:passedReply, disabled }  = toRefs(props);


    const showInput         = ref(false);

    const editorPlaceholder = ref(t('Write a public comment ...'));
    const repliesVisible    = ref(false);
    
    const noCacheKey = ref('')

    const { entityId, pid, id } = passedReply.value
    const headers = ref({})
    const query         = computed(() =>clone ({ ...route.query || {}, ...siteStore.params,  }))


    const { data, status, refresh } = await useLazyFetch(()=>`/api/comments/${encodeURIComponent(entityId.type)}/${encodeURIComponent(entityId.id)}/${encodeURIComponent(id)}`, {  method: 'GET', query,  onResponse });

    const reply = computed(()=> data.value || passedReply.value);
    const count = computed(()=> reply?.value?.comments.filter(({status})=>status)?.length || 0);

    const key     = computed(()=> unref(reply?.value?.id));
    const inProgress = ref(false);
    const replies = computed(()=> reply?.value?.comments || []);
    const loading = computed(()=>  inProgress.value);

    // function onRequest({ request, options }) { options.headers = headers.value; }

    function onResponse({ response }){
        const key = response.headers.get('c-key');

        if(!key || key === 'undefined') return;

        response._data.cacheKey = key;
    }

    async function sendComment(){
        try{
            showInput.value = false;    
            inProgress.value = true;
            const entityIdentifier      = unref(reply?.value?.entityId?.id);
            const entityType            = unref(reply?.value?.entityId?.type);
            const replyIdentifier       = unref(reply?.value?.id);
            const replyType             = unref(reply?.value?.type);

            const comment = replyEditor.value.innerHTML;
            const body    = { comment, entityIdentifier, entityType, replyIdentifier, replyType  };//type:unref(type), identifier:unref(identifier), replyIdentifier: unref(replyIdentifier), comment, replyType:unref(replyType) 
            const resp    = await $fetch(`/api/comments`, { method: 'POST', body });

            return resp;
        }catch(e){
            consola.error(e);
            alertStore.addError({
                                    message       : 'Failed to POST reply',
                                    statusCode    : e.statusCode,
                                    statusMessage : e.statusMessage,
                                    data          : e.data,
                                    fatal         : false
                                }); 
        }finally{
            replyEditor.value.innerHTML = '';
            blurEditor();

            refreshReplies();
        }
    }


    const { open, close } = useModal({ 
        component: ModalLogin,
        attrs: {
            escToClose: true,
            onConfirm: () => close()
        }
    })

    function openLogin(){
        if(!meStore.isAuthenticated) return open();
    }

    function focusEditor(event){
        repliesVisible.value= true;
        if(event?.key && event.key !== key.value) return
        
        if(!meStore.isAuthenticated){
            isFocused.value = false;

            return;
        }

        if(!event?.focusEditorField)hideEmojiSelector();
            isFocused.value = true;

        if(replyEditor?.value?.innerHTML?.includes('id="placeholder" class='))
            replyEditor.value.innerHTML = '';

        if(replyEditor.value)
            textCursorHelper.goToEnd(replyEditor.value);
    }

    function blurEditor(event){
        if(replyEditor?.value?.innerHTML !== '') return;
        
        setPlaceHolder();
        isFocused.value = false;
        if(event && showInput.value) showInput.value = false;
        
    }

    function refreshReplies(){
        noCacheKey.value = data.value?.cacheKey;

        // if(noCacheKey.value )headers.value = { 'No-Cache': noCacheKey.value};

        setTimeout(()=>{
            refresh().then(()=>inProgress.value = false);
        }, 50);
        showInput.value = false;
    }

    onMounted(() => { 
        setPlaceHolder();
        eventBus.on('focusEditorField'+key.value,(e)=>{e.key = key.value; focusEditor(e);});
        noCacheKey.value = data.value?.cacheKey;

    })

    function setPlaceHolder(){
        replyEditor.value.innerHTML = `<p id="placeholder" class="mb-0 mt-1 fw-lighter  .text-white-50 fs-6">${editorPlaceholder.value}</p>`;
    }


    function onSelectEmoji(emoji){

        replyEditor.value.innerHTML += emoji.i;
        showEmojiPicker.value = false;
        textCursorHelper.goToEnd(replyEditor.value);
    }

    function showEmojiSelector(){
        focusEditor();
        showEmojiPicker.value = true;
        
    }

    function hideEmojiSelector(){
        blurEditor();
        showEmojiPicker.value = false;
    }



    function focusOnCommentField($event){
        if(disabled.value) return;
        
        showInput.value = true;

        setTimeout(() => {
            
            $event.focusEditorField = true;
            $event.key = key.value;
            eventBus.emit('focusEditorField'+key.value, $event);
        }, 100);

        
    }

    function showReplies(){
        repliesVisible.value = true;
    }
</script>
<style lang="scss" scoped>
.reply{
    background-color: #d3d3d3;
}
.reply-text{
    min-width:80%;
}
.emoji-container{
    position:absolute;
    bottom: -310px;
    left: -20px;
}
.emoji-btn-active {
    color: var(--bs-btn-hover-color);
    text-decoration: none;
    background-color: var(--bs-btn-hover-bg);
    border-color: var(--bs-btn-hover-border-color);
}
.nb{
border: none;
}
.comment{
    transition: 0.3s;
    background-color: alpha($color: #000000);
}
.input-group {
    border: 1px solid var(--bs-gray-300);
    text-decoration: none;
    flex-direction: wrap;
}
.input-group-focus{
    border: 1px solid var(--bs-gray-300);

    text-decoration: none;
    flex-direction: column;
    transition: 0.3s;
}
.input-group-focus > .form-control{
    background-color: lightgray;
    border-top-left-radius: .5rem !important;
    border-top-right-radius: .5rem !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    border-bottom: none;
}
.input-group-focus > .form-control
{
  width: 100%
}
.input-group-focus > .input-group-text{
    background-color: lightgray;
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
    border-bottom-left-radius: .5rem !important;
    border-bottom-right-radius: .5rem !important;
    border-top: none;
}
.input-group-text, .form-control {
    background-color: lightgray;
    text-decoration: none;
    border-right: none; 
}
.input-group-text{
    cursor: pointer;
    background-color: lightgray;
    border-color: #BFBFBF;
}
.form-control {
    border-right: none ;
    background-color: lightgray;
    border-color: #BFBFBF;
}

#comment-editor:focus {
    outline: none;
    box-shadow: none;
}
</style>
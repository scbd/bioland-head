<template>
    <div @click="openLogin">
        <!-- <div class="debug">count:{{count}}</div> -->
        <div  class="d-flex  align-items-end  fs-5 mt-5" :class="{ 'justify-content-end' : (!likes && count), 'justify-content-between' : (likes )}" style="margin-bottom:-10px;">
            <span v-if="likes" class="text-muted">{{likes}} {{ t('like', likes) }}</span> 
            <span>
                <span v-if="!isReply && count" class="text-muted">{{count}} {{ t('comment', count) }}</span>

                <button @click="showReplies" v-if="isReply && count"  type="button" class="btn btn-outline-dark nb ">{{count}} {{ t('reply', count) }}</button>
                <span class="text-muted">&nbsp;&nbsp;&nbsp;</span>
            </span>
        </div>
        <hr  class="my-1 mb-0" :class="{  'mt-1':isReply && (!likes && !count), 'mt-4':!isReply && (!likes && !count)}"/> 


        <div class="d-flex justify-content-between  align-items-center px-5 fs-4">

            <button @click.prevent.stop="focusOnCommentField" type="button" class="btn btn-outline-dark nb"> <Icon name="comment" :size="1.25" /> &nbsp;<span v-if="!isReply" class="text-capitalize">{{t('comment')}}</span><span v-if="isReply">{{t('Reply')}}</span></button>
            <!-- <button type="button" class="btn btn-outline-dark nb"> <Icon name="mail-forward" :size="1.25" /> &nbsp;<span class="text-capitalize">{{t('share')}}</span></button> -->

        </div>
        <hr class="my-0" />
        <!-- :class="{ 'my-1': !isReply, 'my-0': isReply}" -->

        <div v-show="showInput" class="comment position-relative mt-1" v-click-outside="blurEditor">
            <input  class="form-control" type="hidden" placeholder="Write a public comment" aria-label="Amount (to the nearest dollar)">
            
            <div :class="{'input-group': !isFocused, 'input-group-focus': isFocused}" class="input-group input-group-lg    mb-3">
                <div id="comment-editor" :ref="(el) => commentEditor[key] = el" @focus="focusEditor" class="form-control px-3" contenteditable>
                    
                </div>
                <div class="input-group-text" >
                    <div class="d-flex justify-content-between align-items-center w-100">
                        <div >
                        <!-- <button v-if="meStore.isAuthenticated" type="button" class="btn btn-outline-dark nb me-1"><Icon name="camera" :size="1.25" /> </button> -->
                        <button @click="showEmojiSelector" :class="{'emoji-btn-active':showEmojiPicker}" type="button" class="btn btn-outline-dark nb me-1 ">
                            <Icon name="happy-face" :size="1.25" /> 
                        </button>
                        <!--  <Icon name="video" :size="1.25" /> -->
                        </div>
                        <button @click="sendComment" type="button" class="btn btn-outline-dark nb ">
                            <Icon name="send" :size="1.25" />
                        </button>
                    </div>

                </div>
                
            </div> 
            <div v-click-outside="hideEmojiSelector" class="emoji-container z-1 ps-1" v-if="showEmojiPicker" >
                <NuxtEmojiPicker  :hide-search="false" theme="dark" @select="onSelectEmoji" />
            </div>
        </div>
        <div v-if="repliesVisible" class="my-1">
            <div  v-for="(reply,index) in replies" :key="index">

                <PageCommentReply :reply="reply" />

            </div>
        </div>
    </div>
</template>
<script setup>
    import   textCursorHelper   from 'text-cusor-helper'            ;
    import   ModalLogin         from '~/components/modal/login.vue' ;
    import { useModal         } from 'vue-final-modal'              ;

    const alertStore      = useAlertStore();
    const    siteStore       = useSiteStore();
    const    pageStore       = usePageStore();
    const    meStore         = useMeStore();
    const    eventBus        = useEventBus();
    const  { t,  }             = useI18n();
    const    commentEditor   = ref({});
    const    isFocused       = ref(false);
    const    showEmojiPicker = ref(false);


    const   props  = defineProps({ 
                                    type           : { type:  String },
                                    identifier     : { type:  String },
                                    replyIdentifier: { type:  String },
                                    replyType: { type:  String, default: 'comment--comment_forum' },
                                    count: { type: Number, default: 0 },
                                    likes: { type: Number, default: 0 },
                                    replies: { type: Array, default: [] }
                                });

    const {  type: passedType, identifier: passedIdentifier, replyIdentifier, count, likes, replyType} = toRefs(props);

    const type       = ref(unref(passedType) || pageStore?.page?.type);
    const identifier = ref(unref(passedIdentifier) || pageStore?.page?.id);      

    const isReply       = ref(!!replyIdentifier.value);
    const showInput     = ref( false);
    const key           = ref(`${type.value}-${identifier.value}-${replyIdentifier.value || 0}`);

    if(!type || !identifier) throw new Error('FormCommentInput: Type and Identifier are required');

    const editorPlaceholder = ref(t('Write a public comment ...'));
    const repliesVisible = ref(true);
    function showReplies(){
        repliesVisible.value = !repliesVisible.value;
    }

    async function sendComment(){
        try{
            const comment = commentEditor.value[key.value].innerHTML;
            const body    = { entityType:unref(type), entityIdentifier:unref(identifier), replyIdentifier: unref(replyIdentifier), comment, replyType:unref(replyType) };
            const resp    = await $fetch(`/api/comments`, { method: 'POST', body });

            return resp;
        }catch(e){
        //     consola.error(e);
        //     consola.error(e.statusCode);
        // consola.error(e.statusMessage);
        // consola.error(e.data);
        alertStore.addError({
        message: 'Failed to POST comment',
            statusCode: e.statusCode,
            statusMessage: e.statusMessage,
            data: e.data,
            fatal : false
        }); 
        }finally{
            commentEditor.value[key.value].innerHTML = '';
            blurEditor();
            eventBus.emit('changePage',{ noCache: true });
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
        if(event?.key && event.key !== key.value) return

        repliesVisible.value = true;
        if(!meStore.isAuthenticated){
            isFocused.value = false;

            return;
        }
        if(!event?.focusEditorField)hideEmojiSelector();
            isFocused.value = true;

        if(commentEditor?.value[key.value]?.innerHTML?.includes('id="placeholder" class='))
            commentEditor.value[key.value].innerHTML = '';

if(commentEditor.value[key.value])
        textCursorHelper.goToEnd(commentEditor.value[key.value]);
    }

    function blurEditor(event){
   
        if(event && isReply.value && showInput.value) showInput.value = false;
        if(commentEditor?.value[key.value]?.innerHTML !== '') return;
        
        setPlaceHolder();
        isFocused.value = false;
        
    }

    onMounted(() => { 
        // commentEditor.value[key.value].addEventListener('input',onEdit,false);
        setPlaceHolder();
        eventBus.on('focusEditorField'+key.value,focusEditor);//(e)=>{e.key = key.value; focusEditor(e);}

        showInput.value = isReply.value? false : true;
    })

    function setPlaceHolder(){
        commentEditor.value[key.value].innerHTML = `<p id="placeholder" class="mb-0 mt-1 fw-lighter  .text-white-50 fs-6">${editorPlaceholder.value}</p>`;
    }

    // function onEdit(event){
    //     consola.warn(event?.target?.innerHTML)
    // }

    function onSelectEmoji(emoji){

        commentEditor.value[key.value].innerHTML += emoji.i;
        showEmojiPicker.value = false;
        textCursorHelper.goToEnd(commentEditor.value[key.value]);
    }

    function showEmojiSelector(){
        focusEditor();
        showEmojiPicker.value = true;
        
    }

    function hideEmojiSelector(){
        blurEditor();
        showEmojiPicker.value = false;
    }

    function formatComment(){

    }


    function focusOnCommentField($event){
        showInput.value = true;

        setTimeout(() => {
            
            $event.focusEditorField = true;
            eventBus.emit('focusEditorField'+key.value, $event);
        }, 100);

        
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
}
.input-group {
    border: 1px solid var(--bs-gray-300);

    /* border-radius: .5rem; */
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
    // border-right: 1px solid #BFBFBF !important;
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
/* border-right: 1px solid #BFBFBF !important; */
}
.input-group-text, .form-control {
    background-color: lightgray;

//   border-color: #4D4D4D;
  
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
/* input[type=text]{
    width:100%;
} */

#comment-editor:focus {
  outline: none;
  box-shadow: none;
}
</style>
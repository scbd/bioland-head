<template>
    <div @click="openLogin">
        <div class="d-flex justify-content-between align-items-center  fs-5">
            <span>27 likes</span> 
            <span>
                <span>3 comments</span>
                <span>&nbsp;&nbsp;&nbsp;</span>
                <span>5 shares</span>
            </span>
        </div>
        <hr class="my-2"/>

        <div class="d-flex justify-content-between  align-items-center px-5 fs-4">
            <button type="button" class="btn btn-outline-dark nb"><Icon name="thumbs-up" :size="1.25" /> &nbsp;<span>Like</span></button>
            <button @click.prevent.stop="focusOnCommentField" type="button" class="btn btn-outline-dark nb"> <Icon name="comment" :size="1.25" /> &nbsp;<span>Comment</span></button>
            <button type="button" class="btn btn-outline-dark nb"> <Icon name="mail-forward" :size="1.25" /> &nbsp;<span>Share</span></button>

        </div>
        <hr class="my-2"/>
        <div class="comment position-relative" v-click-outside="blurEditor">
            <input  class="form-control" type="hidden" placeholder="Write a public comment" aria-label="Amount (to the nearest dollar)">
            
            <div :class="{'input-group': !isFocused, 'input-group-focus': isFocused}" class="input-group input-group-lg    mb-3">
                <div id="comment-editor" ref="commentEditor" @focus="focusEditor" class="form-control px-3" contenteditable>
                    
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
    </div>
</template>
<script setup>
    import   textCursorHelper   from 'text-cusor-helper'            ;
    import   ModalLogin         from '~/components/modal/login.vue' ;
    import { useModal         } from 'vue-final-modal'              ;

    const    siteStore       = useSiteStore();
    const    pageStore       = usePageStore();
    const    meStore         = useMeStore();
    const    eventBus        = useEventBus();
    const  { t }             = useI18n();
    const    commentEditor   = ref(null);
    const    isFocused       = ref(false);
    const    showEmojiPicker = ref(false);

    const   props  = defineProps({ 
                                    type           : { type:  String },
                                    identifier     : { type:  String },
                                    replyIdentifier: { type:  String } 
                                });

    const {  type: passedType, identifier: passedIdentifier, replyIdentifier } = toRefs(props);

    const type       = unref(passedType) || pageStore?.page?.type;
    const identifier = unref(passedIdentifier) || pageStore?.page?.id;                           

    if(!type || !identifier) throw new Error('FormCommentInput: Type and Identifier are required');

    const editorPlaceholder = ref(t('Write a public comment ...'));

    async function sendComment(){
        try{
            const comment = commentEditor.value.innerHTML;
            const body    = { type, identifier, replyIdentifier: unref(replyIdentifier), comment };
            const resp    = await $fetch(`/api/comments`, { method: 'POST', body });

            return resp;
        }catch(e){
            consola.error(e);
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
        if(!meStore.isAuthenticated){
            isFocused.value = false;

            return
        }
        if(!event?.focusEditorField)hideEmojiSelector();
        isFocused.value = true;

        if(commentEditor?.value?.innerHTML?.includes('id="placeholder" class='))
            commentEditor.value.innerHTML = '';

        textCursorHelper.goToEnd(commentEditor.value);
    }

    function blurEditor(event){
        if(commentEditor?.value?.innerHTML !== '') return;
        
        setPlaceHolder();
        isFocused.value = false;
    }

    onMounted(() => { 
        commentEditor.value.addEventListener('input',onEdit,false);
        setPlaceHolder();
        eventBus.on('focusEditorField',focusEditor);
    })

    function setPlaceHolder(){
        commentEditor.value.innerHTML = `<p id="placeholder" class="mb-0 mt-1 fw-lighter  .text-white-50 fs-6">${editorPlaceholder.value}</p>`;
    }

    function onEdit(event){
        consola.warn(event?.target?.innerHTML)
    }

    function onSelectEmoji(emoji){

        commentEditor.value.innerHTML += emoji.i;
        showEmojiPicker.value = false;
        textCursorHelper.goToEnd(commentEditor.value);
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


</script>
<style lang="scss" scoped>
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